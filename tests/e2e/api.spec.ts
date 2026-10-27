import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { request as frontendRequest } from '../../apps/web/src/lib/api';
const password = process.env.E2E_ADMIN_PASSWORD || 'Tdd-e2e-only-password-2026';
async function login(api: any) {
  const csrf = await (await api.get('/api/auth/csrf')).json();
  const response = await api.post('/api/auth/login', { form: { username: 'e2e-admin', password, _csrf: csrf.token } });
  expect(response.status()).toBe(200);
  return (await (await api.get('/api/auth/csrf')).json()).token as string;
}

test('anonymous access and CSRF protect all administrative mutations', async ({request}) => {
  expect((await request.get('/api/health')).status()).toBe(200);
  expect((await request.get('/api/admin/v1/works')).status()).toBe(401);
  expect([401,403]).toContain((await request.post('/api/admin/v1/works')).status());
  await login(request);
  expect((await request.post('/api/admin/v1/works')).status()).toBe(403);
});

test('the frontend request helper browses through the real HTTP JSON boundary', async () => {
  const nativeFetch = globalThis.fetch;
  const base = process.env.API_BASE || 'http://127.0.0.1:18081';
  globalThis.fetch = ((input, init) => nativeFetch(new URL(String(input), base), init)) as typeof fetch;
  try {
    const catalog = await frontendRequest<{orderedPublicKeys:string[]}>('/api/public/v1/works/catalog');
    const result = await frontendRequest<{items:unknown[]; total:number}>('/api/public/v1/works/browse', {
      method:'POST', body:JSON.stringify({orderedPublicKeys:catalog.orderedPublicKeys,take:12}),
    });
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  } finally {
    globalThis.fetch = nativeFetch;
  }
});

test('real image, draft, preview, publication, cover order and withdrawal form a persistent content lifecycle', async ({request, playwright}) => {
  const csrf = await login(request);
  const headers = { 'X-CSRF-TOKEN': csrf };
  const upload = await request.post('/api/admin/v1/assets', {headers,multipart:{file:{name:'sample.png',mimeType:'image/png',buffer:readFileSync('tests/fixtures/sample.png')}}});
  expect(upload.status()).toBe(200);
  const asset=await upload.json();
  expect(asset.id).toBeTruthy();
  expect((await request.get(asset.previewUrl)).status()).toBe(200);
  const anonymous=await playwright.request.newContext({baseURL:process.env.API_BASE||'http://127.0.0.1:18081'});
  expect((await anonymous.get(asset.previewUrl)).status()).toBe(401);
  const size=asset.displayImages[0].size;
  const publicMedia=`/media/${asset.publicToken}/${size}`;
  expect((await anonymous.get(publicMedia)).status()).toBe(404);
  let response=await request.post('/api/admin/v1/works',{headers});
  expect(response.status()).toBe(200);
  let work=await response.json();
  const content={...work.draft.content,title:'端到端包装项目',slug:`e2e-packaging-${Date.now()}`,client:'测试客户',role:'包装设计',blocks:[{id:'test-image-one',type:'image',sortOrder:1,assetId:asset.id,alt:'测试包装正面',caption:'首图'},{id:'test-text-one',type:'text',sortOrder:2,text:'端到端测试中的项目说明。'}],coverImageId:'test-image-one',coverCrop:null,coverFocal:null};
  response=await request.put(`/api/admin/v1/works/${work.id}/draft`,{headers,data:{expectedDraftRevision:work.draftRevision,content}});
  expect(response.status()).toBe(200); work=await response.json();
  expect((await anonymous.get(`/api/public/v1/works/${content.slug}`)).status()).toBe(404);
  response=await request.get(`/api/admin/v1/previews/works/${work.id}?revision=${work.draftRevision}`);
  expect(response.status()).toBe(200);
  expect((await response.json()).title).toBe(content.title);
  const originalPublish={targetDraftRevision:work.draftRevision,expectedStateRevision:work.stateRevision};
  response=await request.post(`/api/admin/v1/works/${work.id}/publish`,{headers,data:originalPublish});
  expect(response.status()).toBe(200);work=await response.json();
  response=await anonymous.get(`/api/public/v1/works/${content.slug}`);
  expect(response.status()).toBe(200);
  const detail=await response.json();
  expect(detail.title).toBe(content.title);expect(detail.client).toBe('测试客户');expect(detail.role).toBe('包装设计');
  expect(JSON.stringify(detail)).not.toContain('originalPath');expect(JSON.stringify(detail)).not.toContain('draftRevision');
  expect((await anonymous.get(publicMedia)).status()).toBe(200);
  const originalVersion=work.published.version;
  response=await request.post(`/api/admin/v1/works/${work.id}/publish`,{headers,data:originalPublish});
  expect(response.status()).toBe(200);expect((await response.json()).published.version).toBe(originalVersion);
  response=await request.put(`/api/admin/v1/works/${work.id}/draft`,{headers,data:{expectedDraftRevision:work.draftRevision,content:{...work.draft.content,title:'只有草稿的新标题'}}});
  expect(response.status()).toBe(200);work=await response.json();
  expect((await (await anonymous.get(`/api/public/v1/works/${content.slug}`)).json()).title).toBe(content.title);
  response=await request.post(`/api/admin/v1/works/${work.id}/unpublish`,{headers,data:{expectedStateRevision:work.stateRevision}});
  expect(response.status()).toBe(200);
  expect((await anonymous.get(`/api/public/v1/works/${content.slug}`)).status()).toBe(404);
  expect((await anonymous.get(publicMedia)).status()).toBe(404);
  expect((await request.post(`/api/admin/v1/works/${work.id}/publish`,{headers,data:originalPublish})).status()).toBe(409);
  await anonymous.dispose();
});

test('static WebP uploads and malformed files have distinct outcomes',async({request})=>{
  const csrf=await login(request);const headers={'X-CSRF-TOKEN':csrf};
  const valid=await request.post('/api/admin/v1/assets',{headers,multipart:{file:{name:'sample.webp',mimeType:'image/webp',buffer:readFileSync('tests/fixtures/sample.webp')}}});
  expect(valid.status()).toBe(200);
  const invalid=await request.post('/api/admin/v1/assets',{headers,multipart:{file:{name:'fake.png',mimeType:'image/png',buffer:Buffer.from('not an image')}}});
  expect([400,422]).toContain(invalid.status());
});
