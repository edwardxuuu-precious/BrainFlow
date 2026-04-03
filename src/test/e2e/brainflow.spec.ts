import { expect, test, type Page, type Route } from '@playwright/test'
import type {
  AiChatRequest,
  AiChatResponse,
  AiConversation,
  CodexSettings,
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
    hierarchyCollapsedTopicIds: string[]
  }
  topics: Record<
    string,
    { title: string; parentId?: string | null; layout?: { offsetX: number; offsetY: number } }
  >
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
        const conversationRequest = store.getAll()

        conversationRequest.onerror = () => {
          database.close()
          resolve(null)
        }

        conversationRequest.onsuccess = () => {
          database.close()
          const conversations = (conversationRequest.result as AiConversation[]).filter(
            (conversation) =>
              conversation.documentId === resolvedDocumentId && conversation.archivedAt === null,
          )
          conversations.sort((left, right) => right.updatedAt - left.updatedAt)
          resolve(conversations[0] ?? null)
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
  await topicNode(page, topicTitle).click({ force: true })
}

async function clickCanvasEmptySpace(page: Page): Promise<void> {
  const pane = await page.locator('.react-flow__pane').boundingBox()
  if (!pane) {
    throw new Error('Unable to resolve canvas pane bounds')
  }

  await page.mouse.click(pane.x + 24, pane.y + 24)
}

async function panCanvas(
  page: Page,
  options?: { button?: 'left' | 'middle'; holdSpace?: boolean; deltaX?: number; deltaY?: number },
): Promise<void> {
  const pane = await page.locator('.react-flow__pane').boundingBox()
  if (!pane) {
    throw new Error('Unable to resolve canvas pane bounds')
  }

  const startX = pane.x + pane.width / 2
  const startY = pane.y + pane.height / 2
  const endX = startX + (options?.deltaX ?? 120)
  const endY = startY + (options?.deltaY ?? 80)
  const button = options?.button ?? 'left'

  if (options?.holdSpace) {
    await page.keyboard.down('Space')
  }

  try {
    await page.mouse.move(startX, startY)
    await page.mouse.down({ button })
    await page.mouse.move(endX, endY, { steps: 12 })
    await page.mouse.up({ button })
  } finally {
    if (options?.holdSpace) {
      await page.keyboard.up('Space')
    }
  }
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

async function readViewportTransform(page: Page): Promise<{ x: number; y: number; scale: number }> {
  return page.locator('.react-flow__viewport').evaluate((element) => {
    const transform = getComputedStyle(element).transform
    if (transform === 'none') {
      return { x: 0, y: 0, scale: 1 }
    }

    const matrix = new DOMMatrixReadOnly(transform)
    return {
      x: Number(matrix.e.toFixed(3)),
      y: Number(matrix.f.toFixed(3)),
      scale: Number(matrix.a.toFixed(3)),
    }
  })
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
    systemPromptSummary: 'AI reads the full mind map and applies valid changes to the canvas.',
    systemPromptVersion: 'prompt-test-v1',
    systemPrompt:
      'Use the full mind map as context. Never access repo, backend, file system, or shell.',
    ...overrides,
  }
}

async function mockCodexStatus(
  page: Page,
  status: CodexStatus,
  settings: CodexSettings = {
    businessPrompt: 'Use the full graph as context and apply valid changes to the canvas.',
    updatedAt: 1,
    version: 'settings-test-v1',
  },
): Promise<void> {
  await page.route('**/api/codex/status', (route) => fulfillJson(route, status))
  await page.route('**/api/codex/revalidate', (route) => fulfillJson(route, status))
  await page.route('**/api/codex/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      await fulfillJson(route, settings)
      return
    }

    await fulfillJson(route, settings)
  })
  await page.route('**/api/codex/settings/reset', (route) => fulfillJson(route, settings))
}

async function mockCodexBridgeUnavailable(
  page: Page,
  settings: CodexSettings = {
    businessPrompt: 'Use the full graph as context and apply valid changes to the canvas.',
    updatedAt: 1,
    version: 'settings-test-v1',
  },
): Promise<void> {
  const fulfillUnavailable = async (route: Route) => {
    await route.fulfill({
      status: 502,
      contentType: 'text/plain; charset=utf-8',
      body: 'Bad Gateway',
    })
  }

  await page.route('**/api/codex/status', fulfillUnavailable)
  await page.route('**/api/codex/revalidate', fulfillUnavailable)
  await page.route('**/api/codex/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      await fulfillJson(route, settings)
      return
    }

    await fulfillJson(route, settings)
  })
  await page.route('**/api/codex/settings/reset', (route) => fulfillJson(route, settings))
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
        type: 'status',
        stage: 'starting_codex',
        message: 'Starting local Codex…',
      }),
      JSON.stringify({
        type: 'status',
        stage: 'waiting_first_token',
        message: 'Codex is drafting a natural-language answer…',
      }),
      JSON.stringify({
        type: 'status',
        stage: 'streaming',
        message: 'Codex is streaming the answer…',
      }),
      JSON.stringify({
        type: 'assistant_delta',
        delta: response.assistantMessage.slice(0, 24),
      }),
      JSON.stringify({
        type: 'assistant_delta',
        delta: response.assistantMessage.slice(24),
      }),
      JSON.stringify({
        type: 'status',
        stage: 'planning_changes',
        message: 'Preparing canvas changes…',
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

async function mockCodexChatError(
  page: Page,
  error: {
    code: string
    message: string
    issues?: Array<{ code: string; message: string }>
  },
  onRequest?: (request: AiChatRequest) => void,
): Promise<void> {
  await page.route('**/api/codex/chat', async (route) => {
    const request = route.request().postDataJSON() as AiChatRequest
    onRequest?.(request)

    const events = [
      JSON.stringify({
        type: 'error',
        code: error.code,
        message: error.message,
        issues: error.issues ?? [],
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
  await page.getByRole('button', { name: '鏂板缓鑴戝浘' }).click()
  await expect(page).toHaveURL(/\/map\//)

  await page.getByRole('button', { name: '杩斿洖鏂囨。' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.locator('article')).toHaveCount(1)

  await page.getByRole('button', { name: '继续最近文档' }).click()
  await expect(page).toHaveURL(/\/map\//)
})

test('persists the active topic and viewport as workspace state without changing updatedAt', async ({
  page,
}) => {
  await page.getByRole('button', { name: '鏂板缓鑴戝浘' }).click()
  await expect(page).toHaveURL(/\/map\//)

  const documentId = page.url().split('/').pop()
  expect(documentId).toBeTruthy()
  if (!documentId) {
    throw new Error('Expected document id to be present in editor URL')
  }

  const initialSnapshot = await readStoredDocument(page, documentId)
  expect(initialSnapshot).not.toBeNull()

  await selectTopicNode(page, '分支二')
  await page.getByRole('button', { name: '鏀惧ぇ' }).click()
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

test('supports middle-button panning without breaking Space pan or box selection', async ({
  page,
}) => {
  await page.getByRole('button', { name: '鏂板缓鑴戝浘' }).click()
  await expect(page).toHaveURL(/\/map\//)

  const initialViewport = await readViewportTransform(page)

  await panCanvas(page, { button: 'middle' })
  await expect
    .poll(async () => {
      const viewport = await readViewportTransform(page)
      return Math.abs(viewport.x - initialViewport.x) + Math.abs(viewport.y - initialViewport.y)
    })
    .toBeGreaterThan(1)

  const afterMiddlePan = await readViewportTransform(page)

  await panCanvas(page, { holdSpace: true, deltaX: -90, deltaY: -60 })
  const afterSpacePan = await readViewportTransform(page)
  expect(
    Math.abs(afterSpacePan.x - afterMiddlePan.x) + Math.abs(afterSpacePan.y - afterMiddlePan.y),
  ).toBeGreaterThan(1)

  await dragSelectTopics(page, ['中心主题', '分支一'])
  await expectSelectedNodeCount(page, 2)
})

test('collapses desktop sidebars into rails and restores them after reload', async ({ page }) => {
  await page.getByRole('button', { name: '鏂板缓鑴戝浘' }).click()
  await expect(page).toHaveURL(/\/map\//)

  const documentId = page.url().split('/').pop()
  expect(documentId).toBeTruthy()
  if (!documentId) {
    throw new Error('Expected document id to be present in editor URL')
  }

  await page.getByRole('button', { name: '隐藏层级栏' }).click()
  await expect(page.getByRole('button', { name: '显示层级栏' })).toBeVisible()
  await expect(page.locator('nav[aria-label="主题层级"]')).toHaveCount(0)

  await page
    .locator('#editor-right-sidebar')
    .getByRole('button', { name: '隐藏检查器' })
    .first()
    .click()
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

test('persists hierarchy tree collapse separately from canvas nodes and re-expands the active path', async ({
  page,
}) => {
  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)

  const documentId = page.url().split('/').pop()
  expect(documentId).toBeTruthy()
  if (!documentId) {
    throw new Error('Expected document id to be present in editor URL')
  }

  const hierarchyNav = page.locator('nav[aria-label="主题层级"]')
  await hierarchyNav.getByRole('button', { name: /分支二/ }).click()
  await page
    .locator('#editor-right-sidebar')
    .getByRole('button', { name: '新增子主题' })
    .click()

  await expect(hierarchyNav.getByText('新主题', { exact: true })).toBeVisible()
  await hierarchyNav.getByRole('button', { name: '折叠 分支二' }).click()
  await expect(hierarchyNav.getByText('新主题', { exact: true })).toHaveCount(0)

  await page.waitForTimeout(700)
  const storedDocument = await readStoredDocument(page, documentId)
  const branchId =
    Object.entries(storedDocument?.topics ?? {}).find(([, topic]) => topic.title === '分支二')?.[0] ?? ''
  const childId =
    Object.entries(storedDocument?.topics ?? {}).find(
      ([, topic]) => topic.title === '新主题' && topic.parentId === branchId,
    )?.[0] ?? ''

  expect(storedDocument?.workspace.hierarchyCollapsedTopicIds).toContain(branchId)
  expect(childId).not.toBe('')

  await page.evaluate(
    async ({ resolvedDocumentId, selectedTopicId }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('brainflow-documents-v1')

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('documents', 'readwrite')
          const store = transaction.objectStore('documents')
          const getRequest = store.get(resolvedDocumentId)

          getRequest.onerror = () => {
            database.close()
            reject(getRequest.error)
          }

          getRequest.onsuccess = () => {
            const document = getRequest.result as StoredDocumentSnapshot | null
            if (document) {
              document.workspace.selectedTopicId = selectedTopicId
              store.put(document)
            }
          }

          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => {
            database.close()
            reject(transaction.error)
          }
        }
      })
    },
    {
      resolvedDocumentId: documentId,
      selectedTopicId: childId,
    },
  )

  await page.reload()
  const reloadedHierarchyNav = page.locator('nav[aria-label="主题层级"]')
  await expect(reloadedHierarchyNav.getByRole('button', { name: '折叠 分支二' })).toBeVisible()
  await expect(reloadedHierarchyNav.getByText('新主题', { exact: true })).toBeVisible()
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
    aiSidebar(page).getByText('当前 Codex 验证信息不可用，修复登录或订阅后才能继续发送。'),
  ).toBeVisible()
  await expect(
    aiSidebar(page).getByText('当前 Codex 需要重新验证，请运行 codex login --device-auth 后再试。'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '发送' })).toBeDisabled()

  await page.getByRole('button', { name: '重新验证' }).click()
  await expect.poll(() => revalidateRequests).toBeGreaterThan(0)
})

test('shows service remediation when the local Codex bridge is unavailable', async ({ page }) => {
  await mockCodexBridgeUnavailable(page)

  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)
  await page.getByRole('tab', { name: 'AI' }).click()

  await expect(aiSidebar(page).getByText('未连接服务')).toBeVisible()
  await expect(
    aiSidebar(page).getByText('当前未连接到本机 Codex 服务，AI 发送能力已暂停。'),
  ).toBeVisible()
  await expect(
    aiSidebar(page).getByText('本机 Codex 服务未连接，请先运行 pnpm dev 或 pnpm dev:server。'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '发送' })).toBeDisabled()
})

test('shows schema execution failures separately from Codex availability and surfaces status feedback', async ({
  page,
}) => {
  await mockCodexStatus(page, createReadyStatus())
  await mockCodexChatError(page, {
    code: 'schema_invalid',
    message:
      '本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。这不是登录问题，重新验证不会解决，请修复应用端格式后再试。',
  })

  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)
  await page.getByRole('tab', { name: 'AI' }).click()

  await expect(page.getByRole('button', { name: '检查状态' })).toBeVisible()

  const composer = page.getByRole('textbox', { name: 'AI 提问输入框' })
  await composer.fill('请直接基于当前脑图生成一个 GTM 计划')
  await page.getByRole('button', { name: '发送' }).click()

  await expect(aiSidebar(page).getByText('最近一次执行失败')).toBeVisible()
  await expect(aiSidebar(page).getByText('本地 AI bridge 格式错误')).toBeVisible()
  await expect(
    aiSidebar(page).getByText('这是应用端格式问题，不是登录问题，重新验证不会解决。'),
  ).toBeVisible()
  await expect(aiSidebar(page).getByText('已检测到本机 Codex CLI 与 ChatGPT 登录状态，可以直接基于当前脑图发起对话。')).toBeVisible()

  await page.getByRole('button', { name: '检查状态' }).click()
  await expect(aiSidebar(page).getByText('已重新检查，本机 Codex 当前可用。')).toBeVisible()
})

test('supports box selection, additive click, and additive box selection', async ({ page }) => {
  await mockCodexStatus(page, createReadyStatus())

  await page.getByRole('button', { name: '鏂板缓鑴戝浘' }).click()
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
  await expect(aiSidebar(page).getByText('中心主题')).toBeVisible()
  await expect(aiSidebar(page).getByText('分支一')).toBeVisible()
})

test('uses the full graph as context and applies Codex changes directly to the canvas', async ({
  page,
}) => {
  const requests: string[] = []
  let capturedChatRequest: AiChatRequest | null = null

  page.on('request', (request) => {
    requests.push(request.url())
  })

  await mockCodexStatus(page, createReadyStatus())

  await page.getByRole('button', { name: '鏂板缓鑴戝浘' }).click()
  await expect(page).toHaveURL(/\/map\//)

  const documentId = page.url().split('/').pop()
  expect(documentId).toBeTruthy()
  if (!documentId) {
    throw new Error('Expected document id to be present in editor URL')
  }

  await selectTopicNode(page, '鍒嗘敮涓€')
  const storedBeforeSend = await readStoredDocument(page, documentId)
  expect(storedBeforeSend).not.toBeNull()
  const branchTopicId =
    Object.entries(storedBeforeSend?.topics ?? {}).find(([, topic]) => topic.title === '鍒嗘敮涓€')?.[0] ?? ''

  await mockCodexChat(
    page,
    {
      assistantMessage: '我已经按你的表达补出一组 GTM 结构，并直接落到了当前脑图里。',
      needsMoreContext: false,
      contextRequest: [],
      proposal: {
        id: 'proposal_1',
        summary: '已新增 2 个 GTM 子主题',
        baseDocumentUpdatedAt: storedBeforeSend?.updatedAt ?? 0,
        operations: [
          {
            type: 'create_child',
            parent: `topic:${branchTopicId}`,
            title: 'GTM 璁″垝',
            note: '围绕目标用户、渠道与定价展开。',
            resultRef: 'tmp_gtm_pricing',
          },
          {
            type: 'create_child',
            parent: 'ref:tmp_gtm_pricing',
            title: '目标用户',
            note: '明确核心客群、购买动机与触达入口。',
          },
          {
            type: 'create_child',
            parent: 'ref:tmp_gtm_pricing',
            title: '渠道策略',
            note: '列出首批验证渠道、投放节奏与内容动作。',
          },
        ],
      },
    },
    (request) => {
      capturedChatRequest = request
    },
  )

  await page.getByRole('tab', { name: 'AI' }).click()
  await expect(aiSidebar(page).getByText('分支一')).toBeVisible()

  const composer = page.getByRole('textbox', { name: 'AI 提问输入框' })
  await composer.fill('我现在想要做 GTM，请直接帮我拆成可以执行的脑图结构')
  await page.getByRole('button', { name: '发送' }).click()

  await expect(topicNode(page, '目标用户')).toBeVisible()
  await expect(topicNode(page, '渠道策略')).toBeVisible()
  await expect(
    aiSidebar(page).getByLabel('最近已应用改动').getByText(/已新增 2 个 GTM 子主题/),
  ).toBeVisible()
  await expect(aiSidebar(page).getByRole('button', { name: '撤销' })).toBeVisible()

  expect(capturedChatRequest).not.toBeNull()
  expect(capturedChatRequest!.context.documentTitle).toBe('未命名脑图')
  expect(capturedChatRequest!.context.focus.selectedTopicIds).toHaveLength(1)
  expect(capturedChatRequest!.context.topics.length).toBeGreaterThan(1)

  await expect(
    page.locator('nav[aria-label="主题层级"]').getByText('目标用户'),
  ).toBeVisible()

  await page.waitForTimeout(700)
  const storedConversation = await readStoredAiConversation(page, documentId ?? '')
  expect(storedConversation?.messages.map((message) => message.role)).toEqual([
    'user',
    'assistant',
    'assistant',
  ])

  expect(requests.some((url) => url.includes('/api/codex/status'))).toBe(true)
  expect(requests.some((url) => url.includes('/api/codex/chat'))).toBe(true)
  expect(requests.some((url) => url.includes('api.openai.com'))).toBe(false)

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(topicNode(page, '目标用户')).toHaveCount(0)
  await expect(topicNode(page, '娓犻亾绛栫暐')).toHaveCount(0)

  await page.reload()
  await page.getByRole('tab', { name: 'AI' }).click()
  await expect(page.getByText('我现在想要做 GTM，请直接帮我拆成可以执行的脑图结构')).toBeVisible()
  await expect(aiSidebar(page).getByText(/已新增 2 个 GTM 子主题/)).toBeVisible()
})
