/** 博愛木都心 向城而生：匿名作品照片接收器
 * 部署為網頁應用程式：執行身分「我」，存取權「所有人」。
 * 照片只存入下方固定資料夾，不會更動資料夾或照片的分享設定。
 */
const PHOTO_FOLDER_ID = '1K5rLmUPG4Il4VB1OLUIWcn-1RFY5KlrX';
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const PHOTO_CACHE_SECONDS = 21600;

function doPost(e) {
  const p = e && e.parameter || {};
  const requestId = String(p.requestId || '');
  if (!validRequestId_(requestId)) return json_({status:'error', message:'上傳識別碼不正確。'});
  const cache = CacheService.getScriptCache();
  const cacheKey = 'photo:' + requestId;
  const cached = cache.get(cacheKey);
  if (cached && JSON.parse(cached).status === 'success') return json_(JSON.parse(cached));
  let lock;
  let locked = false;
  try {
    if (containsInappropriateTitle(p.title)) throw new Error('內容含有不適當用語，請修改後再上傳。');
    const title = cleanTitle_(p.title);
    if (!title) throw new Error('請填寫作品名稱（最多 60 個字）。');
    const jpeg = String(p.image || '');
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(jpeg)) throw new Error('照片格式不正確，請重新拍照。');
    const base64 = jpeg.slice(jpeg.indexOf(',') + 1);
    if (base64.length > Math.ceil(PHOTO_MAX_BYTES / 3) * 4) throw new Error('照片太大，請重新拍照。');
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > PHOTO_MAX_BYTES || bytes.length < 4 || (bytes[0] & 255) !== 255 || (bytes[1] & 255) !== 216 || (bytes[2] & 255) !== 255) throw new Error('照片內容不正確，請重新拍照。');
    const captured = new Date(String(p.capturedAt || ''));
    if (!Number.isFinite(captured.getTime())) throw new Error('拍照時間不正確，請重新拍照。');
    const filename = title + '_' + Utilities.formatDate(captured, 'Asia/Taipei', 'yyyyMMdd_HHmmss') + '_' + requestId + '.jpg';
    cache.put(cacheKey, JSON.stringify({status:'pending'}), PHOTO_CACHE_SECONDS);
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    locked = true;
    const again = cache.get(cacheKey);
    if (again && JSON.parse(again).status === 'success') return json_(JSON.parse(again));
    const folder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
    // The same immutable request is safe to retry, even after a response is lost.
    const existing = folder.getFilesByName(filename);
    let file = null;
    if (existing.hasNext()) file = existing.next();
    if (!file) {
      file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', filename));
      file.setDescription('博愛木都心 向城而生\n作品名稱：' + title + '\n拍照時間：' + captured.toISOString() + '\nrequestId=' + requestId);
    }
    const result = {status:'success', filename:filename, title:title};
    cache.put(cacheKey, JSON.stringify(result), PHOTO_CACHE_SECONDS);
    return json_(result);
  } catch (error) {
    const text = String(error && error.message || '');
    // Never expose Drive IDs, account information, stack traces or file listings.
    const message = /^(請填寫作品名稱|照片|拍照時間|內容含有不適當用語)/.test(text) ? text : '目前無法存入作品資料夾，請稍後重試或聯絡老師。';
    const result = {status:'error', message:message};
    cache.put(cacheKey, JSON.stringify(result), PHOTO_CACHE_SECONDS);
    return json_(result);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet(e) {
  const p = e && e.parameter || {};
  const callback = String(p.callback || '');
  let result;
  if (p.action === 'status' && validRequestId_(String(p.requestId || ''))) {
    const cached = CacheService.getScriptCache().get('photo:' + p.requestId);
    result = cached ? JSON.parse(cached) : {status:'pending'};
  } else {
    result = {status:'ready', service:'city-photo-upload', version:1};
  }
  if (callback) {
    if (!/^cityPhoto_[A-Za-z0-9_]{8,80}$/.test(callback)) return json_({status:'error',message:'查詢格式不正確。'});
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(result);
}

function validRequestId_(id) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
}
function cleanTitle_(value) {
  const title = String(value || '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return title.length >= 1 && title.length <= 60 ? title : '';
}
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
/** 可在 Apps Script 編輯器選擇此函式執行，先授權並確認資料夾可存取。 */
function checkPhotoFolder() {
  const folder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  console.log('作品照片資料夾已可存取：' + folder.getName());
}

function containsInappropriateTitle(value) {
  // Normalize width, case, separators and common simplified spellings before matching.
  const normalized = String(value || '').normalize('NFKC').toLowerCase()
    .replace(/妈/g, '媽').replace(/鸡/g, '雞').replace(/机/g, '機').replace(/贱/g, '賤');
  const compact = normalized.replace(/[\s\p{P}\p{S}\p{Cf}]/gu, '');
  const words = ['幹', '幹你娘', '幹妳娘', '幹你媽', '幹妳媽', '操你媽', '操妳媽', '肏你媽', '他媽的', '去你媽的', '狗娘養', '婊子', '賤人', '臭婊', '雞掰', '雞巴', '機掰', '膣屄'];
  return words.some(word => compact.includes(word)) ||
    /(?:^|[^a-z0-9])(fuck|fucking|motherfucker|bitch|asshole|shit)(?=$|[^a-z0-9])/.test(normalized);
}
