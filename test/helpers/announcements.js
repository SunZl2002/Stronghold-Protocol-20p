// 公告弹窗：本分支在一个浏览器首次连接时会自动打开一条未读公告（上游没有这个对话框），它会挡在别的弹窗和点击前面。
// e2e 用例进入页面后调用一次，把屏幕上已经打开的 .modal 关掉，再继续测它自己的东西。
//
// 公告也可能在「连接之后」才到（lobby.state / announcements 的推送），所以先等一下再轮询几次。

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {import('puppeteer-core').Page} page
 * @param {{ tries?: number, waitMs?: number }} [opts]
 * @returns {Promise<number>} how many modals were dismissed
 */
export async function dismissAnnouncements(page, { tries = 5, waitMs = 250 } = {}) {
  let closed = 0;
  await sleep(waitMs);
  for (let i = 0; i < tries; i++) {
    const open = await page.evaluate(() => !!document.querySelector('.modal'));
    if (!open) break;
    await page.keyboard.press('Escape');
    closed++;
    await sleep(waitMs);
    await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 3000 }).catch(() => {});
  }
  return closed;
}

/**
 * 点开设置对话框。本分支的公告弹窗可能比大厅晚一步出现，所以「点一次」会偶发地被它吃掉：
 * 点完等一会儿，列表不在就关掉挡路的弹窗再点，最多三轮。
 * @param {import('puppeteer-core').Page} page
 * @param {string} [selector] the settings button
 * @returns {Promise<boolean>} whether the settings list is up
 */
export async function openSettings(page, selector = '.lobby-screen [data-testid="settings-btn"]') {
  for (let i = 0; i < 3; i++) {
    await dismissAnnouncements(page, { tries: 2, waitMs: 150 });
    await page.click(selector);
    const ok = await page.waitForSelector('.modal .set-list', { timeout: 1200 }).then(() => true).catch(() => false);
    if (ok) return true;
    // something else swallowed the click: close it and try again
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  return false;
}
