import { expect, test, type Page, type Route } from '@playwright/test'
import type {
  AiChatRequest,
  AiChatResponse,
  AiConversation,
  CodexStatus,
} from '../../../shared/ai-contract'

interface StoredDocumentSnapshot {
  updatedAt: number
  viewport: { x: number; y: number; zoom: number }
  workspace: {
    selectedTopicId: string | null
    chrome: {
      leftSidebarOpen: boolean
      rightSidebarOpen: boolean
    }
  }
  topics: Record<string, { title: string; layout?: { offsetX: number; offsetY: number } }>
}

async function deleteDatabase(page: Page, name: string): Promise<void> {
  await page.evaluate(async (databaseName) => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  }, name)
}

async function resetWorkspace(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
  })
  await deleteDatabase(page, 'brainflow-documents-v1')
  await deleteDatabase(page, 'brainflow-ai-v1')
  await page.reload()
}

async function readStoredDocument(
  page: Page,
  documentId?: string,
): Promise<StoredDocumentSnapshot | null> {
  return page.evaluate(async (explicitDocumentId) => {
    const resolvedId = explicitDocumentId ?? location.pathname.split('/').pop()
    if (!resolvedId) {
      return null
    }

    return new Promise<StoredDocumentSnapshot | null>((resolve) => {
      const request = indexedDB.open('brainflow-documents-v1')

      request.onerror = () => resolve(null)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('documents', 'readonly')
        const store = transaction.objectStore('documents')
        const docRequest = store.get(resolvedId)

        docRequest.onerror = () => {
          database.close()
          resolve(null)
        }

        docRequest.onsuccess = () => {
          database.close()
          resolve((docRequest.result as StoredDocumentSnapshot | null) ?? null)
        }
      }
    })
  }, documentId)
}

async function readStoredAiConversation(
  page: Page,
  documentId: string,
): Promise<AiConversation | null> {
  return page.evaluate(async (resolvedDocumentId) => {
    return new Promise<AiConversation | null>((resolve) => {
      const request = indexedDB.open('brainflow-ai-v1')

      request.onerror = () => resolve(null)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('conversations', 'readonly')
        const store = transaction.objectStore('conversations')
        const conversationRequest = store.get(`${resolvedDocumentId}:default`)

        conversationRequest.onerror = () => {
          database.close()
          resolve(null)
        }

        conversationRequest.onsuccess = () => {
          database.close()
          resolve((conversationRequest.result as AiConversation | null) ?? null)
        }
      }
    })
  }, documentId)
}

async function readViewportScale(page: Page): Promise<number> {
  return page.locator('.react-flow__viewport').evaluate((element) => {
    const transform = getComputedStyle(element).transform
    if (transform === 'none') {
      return 1
    }

    return Number(new DOMMatrixReadOnly(transform).a.toFixed(3))
  })
}

async function waitForTopicNodeInViewport(page: Page, topicTitle: string): Promise<void> {
  await page.waitForFunction((title) => {
    const node = Array.from(document.querySelectorAll('.react-flow__node')).find((entry) =>
      entry.textContent?.includes(title),
    )

    if (!node) {
      return false
    }

    const rect = node.getBoundingClientRect()
    return rect.x > 0 && rect.y > 0 && rect.width > 0 && rect.height > 0
  }, topicTitle)
}

function topicNode(page: Page, topicTitle: string) {
  return page.locator('.react-flow__node').filter({ hasText: topicTitle })
}

function aiSidebar(page: Page) {
  return page.locator('#editor-right-sidebar')
}

async function selectTopicNode(page: Page, topicTitle: string): Promise<void> {
  await waitForTopicNodeInViewport(page, topicTitle)
  await topicNode(page, topicTitle).click()
}

async function clickCanvasEmptySpace(page: Page): Promise<void> {
  const pane = await page.locator('.react-flow__pane').boundingBox()
  if (!pane) {
    throw new Error('Unable to resolve canvas pane bounds')
  }

  await page.mouse.click(pane.x + 24, pane.y + 24)
}

async function dragSelectTopics(
  page: Page,
  topicTitles: string[],
  options?: { append?: boolean },
): Promise<void> {
  const boxes = await Promise.all(
    topicTitles.map(async (title) => {
      await waitForTopicNodeInViewport(page, title)
      return topicNode(page, title).boundingBox()
    }),
  )

  const validBoxes = boxes.filter((box): box is NonNullable<typeof box> => Boolean(box))
  if (validBoxes.length === 0) {
    throw new Error(`No topic boxes found for ${topicTitles.join(', ')}`)
  }

  const pane = await page.locator('.react-flow__pane').boundingBox()
  if (!pane) {
    throw new Error('Unable to resolve canvas pane bounds')
  }

  const minX = Math.min(...validBoxes.map((box) => box.x))
  const minY = Math.min(...validBoxes.map((box) => box.y))
  const maxX = Math.max(...validBoxes.map((box) => box.x + box.width))
  const maxY = Math.max(...validBoxes.map((box) => box.y + box.height))
  const padding = 24
  const startX = Math.max(pane.x + 8, minX - padding)
  const startY = Math.max(pane.y + 8, minY - padding)
  const endX = Math.min(pane.x + pane.width - 8, maxX + padding)
  const endY = Math.min(pane.y + pane.height - 8, maxY + padding)

  if (options?.append) {
    await page.keyboard.down('Shift')
  }

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 12 })
  await page.mouse.up()

  if (options?.append) {
    await page.keyboard.up('Shift')
  }
}

async function expectSelectedNodeCount(page: Page, count: number): Promise<void> {
  await expect(page.locator('.react-flow__node [data-selected="true"]')).toHaveCount(count)
}

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  })
}

function createReadyStatus(overrides?: Partial<CodexStatus>): CodexStatus {
  return {
    cliInstalled: true,
    loggedIn: true,
    authProvider: 'ChatGPT',
    ready: true,
    issues: [],
    systemPromptSummary: '只基于当前选区回答，并且只能输出待审批的本地脑图提案。',
    systemPromptVersion: 'prompt-test-v1',
    systemPrompt:
      'Only use the current selection as context. Never access repo, backend, file system, or shell.',
    ...overrides,
  }
}

async function mockCodexStatus(page: Page, status: CodexStatus): Promise<void> {
  await page.route('**/api/codex/status', (route) => fulfillJson(route, status))
  await page.route('**/api/codex/revalidate', (route) => fulfillJson(route, status))
}

async function mockCodexChat(
  page: Page,
  response: AiChatResponse,
  onRequest?: (request: AiChatRequest) => void,
): Promise<void> {
  await page.route('**/api/codex/chat', async (route) => {
    const request = route.request().postDataJSON() as AiChatRequest
    onRequest?.(request)

    const events = [
      JSON.stringify({
        type: 'assistant_delta',
        delta: response.assistantMessage.slice(0, 24),
      }),
      JSON.stringify({
        type: 'result',
        data: response,
      }),
    ].join('\n')

    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson; charset=utf-8',
      body: `${events}\n`,
    })
  })
}

test.beforeEach(async ({ page }) => {
  await resetWorkspace(page)
})

test('creates a document, returns to the list, and reopens it', async ({ page }) => {
  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)

  await page.getByRole('button', { name: '返回文档' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.locator('article')).toHaveCount(1)

  await page.getByRole('button', { name: '继续最近文档' }).click()
  await expect(page).toHaveURL(/\/map\//)
})

test('persists the active topic and viewport as workspace state without changing updatedAt', async ({
  page,
}) => {
  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)

  const documentId = page.url().split('/').pop()
  expect(documentId).toBeTruthy()

  const initialSnapshot = await readStoredDocument(page, documentId)
  expect(initialSnapshot).not.toBeNull()

  await selectTopicNode(page, '分支二')
  await page.getByRole('button', { name: '放大' }).click()
  await page.waitForTimeout(700)

  const savedWorkspace = await readStoredDocument(page, documentId)
  expect(savedWorkspace?.updatedAt).toBe(initialSnapshot?.updatedAt)
  expect(savedWorkspace?.workspace.selectedTopicId).not.toBe(initialSnapshot?.workspace.selectedTopicId)
  expect(savedWorkspace?.viewport.zoom).not.toBe(initialSnapshot?.viewport.zoom)

  const scaleBeforeReload = await readViewportScale(page)
  expect(scaleBeforeReload).toBeCloseTo(savedWorkspace?.viewport.zoom ?? 1, 2)

  await page.reload()
  await waitForTopicNodeInViewport(page, '分支二')
  await expect(topicNode(page, '分支二').locator('[data-active="true"]')).toBeVisible()
  await expect.poll(async () => readViewportScale(page)).toBeCloseTo(
    savedWorkspace?.viewport.zoom ?? 1,
    2,
  )
})

test('collapses desktop sidebars into rails and restores them after reload', async ({ page }) => {
  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)

  const documentId = page.url().split('/').pop()
  expect(documentId).toBeTruthy()

  await page.getByRole('button', { name: '隐藏层级栏' }).click()
  await expect(page.getByRole('button', { name: '显示层级栏' })).toBeVisible()
  await expect(page.locator('nav[aria-label="主题层级"]')).toHaveCount(0)

  await page.getByRole('button', { name: '隐藏右侧栏' }).click()
  await expect(page.getByRole('button', { name: '显示检查器' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '备注' })).toHaveCount(0)

  await page.waitForTimeout(700)
  const collapsedSnapshot = await readStoredDocument(page, documentId)
  expect(collapsedSnapshot?.workspace.chrome).toEqual({
    leftSidebarOpen: false,
    rightSidebarOpen: false,
  })

  await page.reload()
  await expect(page.getByRole('button', { name: '显示层级栏' })).toBeVisible()
  await expect(page.getByRole('button', { name: '显示检查器' })).toBeVisible()
})

test('shows remediation and disables sending when local Codex verification is unavailable', async ({
  page,
}) => {
  let revalidateRequests = 0
  const unavailableStatus = createReadyStatus({
    loggedIn: false,
    ready: false,
    issues: [
      {
        code: 'verification_required',
        message: '当前 Codex 验证信息不可用，请尽快重新验证。',
      },
    ],
  })

  await mockCodexStatus(page, unavailableStatus)
  await page.route('**/api/codex/revalidate', async (route) => {
    revalidateRequests += 1
    await fulfillJson(route, unavailableStatus)
  })

  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)
  await page.getByRole('tab', { name: 'AI' }).click()

  await expect(
    aiSidebar(page).getByText('当前 Codex 验证信息不可用，请尽快修复后重新验证。'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '发送给 AI' })).toBeDisabled()

  await page.getByRole('button', { name: '重新验证' }).click()
  await expect.poll(() => revalidateRequests).toBeGreaterThan(0)
})

test('supports box selection, additive click, and additive box selection', async ({ page }) => {
  await mockCodexStatus(page, createReadyStatus())

  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)

  await dragSelectTopics(page, ['中心主题', '分支一'])
  await expectSelectedNodeCount(page, 2)
  await expect(page.getByRole('heading', { name: '已选择 2 个节点' })).toBeVisible()

  await topicNode(page, '分支二').click({ modifiers: ['Shift'] })
  await expectSelectedNodeCount(page, 3)
  await expect(page.getByRole('heading', { name: '已选择 3 个节点' })).toBeVisible()

  await clickCanvasEmptySpace(page)
  await selectTopicNode(page, '中心主题')
  await expectSelectedNodeCount(page, 1)

  await dragSelectTopics(page, ['分支一'], { append: true })
  await expectSelectedNodeCount(page, 2)

  await page.getByRole('tab', { name: 'AI' }).click()
  await expect(aiSidebar(page).getByText('2 个节点')).toBeVisible()
  await expect(aiSidebar(page).getByText('中心主题')).toBeVisible()
  await expect(aiSidebar(page).getByText('分支一')).toBeVisible()
})

test('uses the current selection as Codex context and only writes after user approval', async ({
  page,
}) => {
  const requests: string[] = []
  let capturedChatRequest: AiChatRequest | null = null

  page.on('request', (request) => {
    requests.push(request.url())
  })

  await mockCodexStatus(page, createReadyStatus())

  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)

  const documentId = page.url().split('/').pop()
  expect(documentId).toBeTruthy()

  await selectTopicNode(page, '分支一')
  const storedBeforeSend = await readStoredDocument(page, documentId)
  expect(storedBeforeSend).not.toBeNull()
  const branchTopicId =
    Object.entries(storedBeforeSend?.topics ?? {}).find(([, topic]) => topic.title === '分支一')?.[0] ?? ''

  await mockCodexChat(
    page,
    {
      assistantMessage: '我先基于当前选区整理出了两个可直接落地的扩展方向。',
      needsMoreContext: false,
      proposal: {
        id: 'proposal_1',
        summary: '为当前分支补充一个新的子主题。',
        baseDocumentUpdatedAt: storedBeforeSend?.updatedAt ?? 0,
        operations: [
          {
            type: 'create_child',
            parentTopicId: branchTopicId,
            title: '分支一：背景与目标',
            note: '由 Codex 生成的上下文补充说明。',
          },
        ],
      },
    },
    (request) => {
      capturedChatRequest = request
    },
  )

  await page.getByRole('tab', { name: 'AI' }).click()
  await expect(aiSidebar(page).getByText('1 个节点')).toBeVisible()
  await expect(aiSidebar(page).getByText('分支一')).toBeVisible()

  const composer = page.getByRole('textbox', { name: 'AI 提问输入框' })
  await composer.fill('请帮我扩展当前节点')
  await page.getByRole('button', { name: '发送给 AI' }).click()

  await expect(page.getByLabel('AI 提案审批')).toBeVisible()
  await expect(page.getByText('为当前分支补充一个新的子主题。')).toBeVisible()
  await expect(topicNode(page, '分支一：背景与目标')).toHaveCount(0)

  expect(capturedChatRequest).not.toBeNull()
  expect(capturedChatRequest!.context.documentTitle).toBe('未命名脑图')
  expect(capturedChatRequest!.context.selectedTopicIds).toHaveLength(1)
  expect(capturedChatRequest!.context.topics.map((topic) => topic.title)).toEqual(['分支一'])

  await page.getByRole('button', { name: '应用到脑图' }).click()
  await expect(topicNode(page, '分支一：背景与目标')).toBeVisible()
  await expect(
    page.locator('nav[aria-label="主题层级"]').getByText('分支一：背景与目标'),
  ).toBeVisible()

  await page.waitForTimeout(700)
  const storedConversation = await readStoredAiConversation(page, documentId ?? '')
  expect(storedConversation?.messages.map((message) => message.role)).toEqual([
    'user',
    'assistant',
  ])
  expect(storedConversation).not.toHaveProperty('attachedTopicIds')

  expect(requests.some((url) => url.includes('/api/codex/status'))).toBe(true)
  expect(requests.some((url) => url.includes('/api/codex/chat'))).toBe(true)
  expect(requests.some((url) => url.includes('api.openai.com'))).toBe(false)

  await page.reload()
  await page.getByRole('tab', { name: 'AI' }).click()
  await expect(page.getByText('请帮我扩展当前节点')).toBeVisible()
  await expect(page.getByText(/我先基于当前选区整理出了两个可直接落地的扩展方向/)).toBeVisible()
})
