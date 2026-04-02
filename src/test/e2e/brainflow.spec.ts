import { expect, test, type Page } from '@playwright/test'

async function resetWorkspace(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('brainflow-documents-v1')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })
  await page.reload()
}

async function readTopicLayout(
  page: Page,
  topicTitle: string,
): Promise<{ offsetX: number; offsetY: number } | null> {
  return page.evaluate(async (title) => {
    const documentId = location.pathname.split('/').pop()
    if (!documentId) {
      return null
    }

    return new Promise<{ offsetX: number; offsetY: number } | null>((resolve) => {
      const request = indexedDB.open('brainflow-documents-v1')

      request.onerror = () => resolve(null)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('documents', 'readonly')
        const store = transaction.objectStore('documents')
        const docRequest = store.get(documentId)

        docRequest.onerror = () => {
          database.close()
          resolve(null)
        }

        docRequest.onsuccess = () => {
          const document = docRequest.result as {
            topics: Record<string, { title: string; layout?: { offsetX: number; offsetY: number } }>
          } | null

          const topic = document
            ? Object.values(document.topics).find((entry) => entry.title === title)
            : null

          database.close()
          resolve(topic?.layout ?? null)
        }
      }
    })
  }, topicTitle)
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

test('creates multiple documents and returns to the list view', async ({ page }) => {
  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)
  await page.getByRole('button', { name: '返回文档' }).click()

  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)
  await page.getByRole('button', { name: '返回文档' }).click()

  await expect(page.locator('article')).toHaveCount(2)
})

test('duplicates and deletes a document from the list', async ({ page }) => {
  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)
  await page.getByRole('button', { name: '返回文档' }).click()

  await page.getByRole('button', { name: '复制' }).click()
  await expect(page.locator('article')).toHaveCount(2)

  await page.getByRole('button', { name: '删除' }).first().click()
  await expect(page.locator('article')).toHaveCount(1)
})

test('persists manual drag offsets and can reset them from the inspector', async ({ page }) => {
  await page.getByRole('button', { name: '新建脑图' }).click()
  await expect(page).toHaveURL(/\/map\//)
  await expect(page.getByText('分支一')).toBeVisible()
  await waitForTopicNodeInViewport(page, '分支一')

  const branchNode = page.locator('.react-flow__node').filter({ hasText: '分支一' })
  const branchBox = await branchNode.boundingBox()
  expect(branchBox).not.toBeNull()

  const startX = (branchBox?.x ?? 0) + (branchBox?.width ?? 0) / 2
  const startY = (branchBox?.y ?? 0) + (branchBox?.height ?? 0) / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX - 96, startY - 48, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(700)

  const movedLayout = await readTopicLayout(page, '分支一')
  expect(Math.abs(movedLayout?.offsetX ?? 0)).toBeGreaterThan(40)
  expect(Math.abs(movedLayout?.offsetY ?? 0)).toBeGreaterThan(20)

  await page.reload()
  await expect(page.getByText('分支一')).toBeVisible()
  await waitForTopicNodeInViewport(page, '分支一')

  const reloadedLayout = await readTopicLayout(page, '分支一')
  expect(reloadedLayout).toEqual(movedLayout)

  await page.getByText('分支一').click()
  await page.getByRole('button', { name: '重置位置' }).click()
  await page.waitForTimeout(700)

  expect(await readTopicLayout(page, '分支一')).toEqual({ offsetX: 0, offsetY: 0 })
})
