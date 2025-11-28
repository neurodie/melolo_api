// index.js (Express.js version of main.py)

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const heicConvert = require('heic-convert');
const app = express();
const PORT = process.env.PORT || 8006;

// ============================================================
// Konfigurasi dasar
// ============================================================

const BASE_URL = 'https://api31-normal-myb.tmtreader.com';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// middleware
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.json());

// Helper kecil untuk error upstream
function upstreamError(res, resp) {
  return res.status(resp.status).json({
    error: 'Upstream HTTP error',
    status: resp.status,
    body: typeof resp.data === 'string' ? resp.data : undefined,
  });
}

// ============================================================
// BAGIAN 0: PROXY IMAGE (HEIC → JPEG)
// ============================================================
// GET /proxy-img?url=<BASE_URL>&x-expires=...&x-signature=...
app.get('/proxy-img', async (req, res) => {
  const { url, ...rest } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Parameter ?url wajib diisi' });
  }

  // Bangun lagi full URL termasuk x-expires, x-signature, dll
  let target = String(url);
  const extraParams = new URLSearchParams();

  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) {
      for (const v of value) extraParams.append(key, String(v));
    } else if (value !== undefined) {
      extraParams.append(key, String(value));
    }
  }

  const extraQuery = extraParams.toString();
  if (extraQuery) {
    target += (target.includes('?') ? '&' : '?') + extraQuery;
  }

  try {
    const headers = {
      // mirip httpx/python, simple & aman
      'User-Agent': 'python-httpx/0.28.1',
      Accept: '*/*',
    };

    const upstream = await axios.get(target, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers,
      validateStatus: () => true, // jangan thrown error 4xx/5xx
    });

    const status = upstream.status;
    const contentType =
      upstream.headers['content-type'] || 'application/octet-stream';
    const buffer = Buffer.from(upstream.data || []);

    // Kalau gagal dari server asal, terusin apa adanya
    if (status !== 200) {
      console.warn(`proxy-img status ${status} for ${target.slice(0, 120)}`);
      res.status(status);
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }

    const isHeic =
      contentType.includes('heic') ||
      contentType.includes('heif') ||
      target.toLowerCase().includes('.heic');

    // === PATH UTAMA: HEIC → JPEG pakai heic-convert ===
    if (isHeic) {
      try {
        const outputBuffer = await heicConvert({
          buffer,
          format: 'JPEG',
          quality: 0.75, // kompromi ukuran vs kualitas
        });

        res.status(200);
        res.setHeader('Content-Type', 'image/jpeg');
        // jangan pakai attachment biar nggak ke-download
        return res.send(Buffer.from(outputBuffer));
      } catch (e) {
        console.warn('HEIC convert gagal, kirim raw HEIC:', e.message);
        // fallback: kirim HEIC mentah (kalau benar2 kepepet)
        res.status(200);
        res.setHeader('Content-Type', contentType);
        return res.send(buffer);
      }
    }

    // Bukan HEIC → passthrough biasa
    res.status(200);
    res.setHeader('Content-Type', contentType);
    return res.send(buffer);
  } catch (err) {
    console.error('proxy-img fatal error:', err.message);
    return res.status(500).json({
      error: 'Proxy error',
      detail: err.message,
    });
  }
});

// ============================================================
// BAGIAN 1: SEARCH
// ============================================================

function buildSearchHeaders() {
  // Silakan sesuaikan msToken / cookie sesuai request asli kamu
  return {
    Host: 'api31-normal-myb.tmtreader.com',
    cookie: 'msToken=GlAmH4XkBZHszQNrmrza28Z6_Hj0QV6DVh3nEbu0JfAdoILPLnOF_hNshwXrtzmAuDVmN1IKbNyKc_DtEYD2oxyyMK2JPpe0nqZrONrD_xE=',
    accept: 'application/json; charset=utf-8,application/x-protobuf',
    'x-xs-from-web': 'false',
    'age-range': '2',
    'sdk-version': '2',
    'passport-sdk-version': '50357',
    'x-vc-bdturing-sdk-version': '2.2.1.i18n',
    'x-ss-dp': '645713',
    'x-tt-trace-id': '00-c8ffb23d1067644799921886069dffff-c8ffb23d10676447-01',
    'user-agent': 'com.worldance.drama/49819 (Linux; U; Android 14; in; M2101K7BNY; Build/UP1A.230905.011; Cronet/TTNetVersion:8f366453 2024-12-24 QuicVersion:ef6c341e 2024-11-14)',
    'accept-encoding': 'gzip, deflate',
    // x-argus dkk biasanya hasil signature – bisa perlu diupdate berkala
    'x-argus': 'n1oPk1Q78KP4hgRp50wRF1Sk4Spb2H9KI6nW0PZOQw3Cxyac5AlJWK1v8kv6blyNGoXiidi4hXwraP9TEJIKYp4+gT0yaWEkU0o/UxtBLdpnYCs4MVCXAcNJGyVZQZ7HTqH910olrOlUIxmWHvWXe4vvMMIZ1cjgVMv1cc8gwBMYTSl+rE/QQJ1hsF2EBLMPGRDXeVNFOhG5wEAWAOx2shugjXMAZL8V3WtT0PrLWCj/76yi...',
    'x-gorgon': '8404205d100004726734efd425adb23ba6615df571b75f667aa4',
    'x-khronos': '1764299058',
    'x-ladon': 'wp/jSSMvg4rPFJxvzGmnhJEGTl1lZQYJ0YzFmo4EMsFlOold',
  };
}

function buildSearchParams(query) {
  // Param pentingnya sama kayak FastAPI
  return {
    search_source_id: 'clks###',
    IsFetchDebug: 'false',
    offset: '0',
    cancel_search_category_enhance: 'false',
    query: query,
    limit: '10',
    time_zone: 'Asia/Makassar',
    os: 'android',
    iid: '7577577407016814353',
    device_id: '7450158408484292102',
    ac: 'wifi',
    channel: 'gp',
    aid: '645713',
    app_name: 'Melolo',
    version_code: '49819',
    version_name: '4.9.8',
    device_platform: 'android',
    ssmix: 'a',
    device_type: 'M2101K7BNY',
    device_brand: 'Redmi',
    language: 'in',
    os_api: '34',
    os_version: '14',
    openudid: 'e6b0dca8002e9072',
    manifest_version_code: '49819',
    resolution: '1080*2263',
    dpi: '440',
    update_version_code: '49819',
    _rticket: '1764308791456',
    current_region: 'ID',
    carrier_region: 'id',
    app_language: 'id',
    sys_language: 'in',
    app_region: 'ID',
    sys_region: 'ID',
    mcc_mnc: '51010',
    carrier_region_v2: '510',
    user_language: 'id',
    ui_language: 'in',
    cdid: '4ea1f05f-e317-401a-9419-a25ca0b71190',
  };
}

app.get('/search', async (req, res) => {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: 'Parameter ?query wajib diisi' });
  }

  try {
    const headers = buildSearchHeaders();
    const params = buildSearchParams(String(query));

    const resp = await axios.get(
      `${BASE_URL}/i18n_novel/search/page/v1/`,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;

    if (data.code && data.code !== 0) {
      return res.status(400).json({
        error: data.message || 'Upstream returned non-zero code',
      });
    }

    const searchData = (data.data?.search_data || []);
    const items = [];

    for (const cell of searchData) {
      for (const book of (cell.books || [])) {
        items.push({
          book_id: book.book_id,
          title: book.book_name,
          author: book.author,
          abstract: book.abstract,
          cover: book.thumb_url,
          status: book.show_creation_status,
          age_gate: book.age_gate,
          read_count: book.read_count,
          language: book.language,
          source: book.source,
        });
      }
    }

    return res.json({
      query: data.data?.query_word,
      total: items.length,
      items,
    });
  } catch (err) {
    console.error('/search error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// ============================================================
// BAGIAN 2: SERIES DETAIL
// ============================================================

function buildSeriesHeaders() {
  return {
    Host: 'api31-normal-myb.tmtreader.com',
    cookie: 'msToken=h16EAyNHNqNr-KwgJMnTkz8oDifUaIpZLL5nY2g88W9EWvPPvDJqRC7pztEqzG75pNvIflxdf8zPHtr759nrSawEU_WFgvEZN_GJjHzC3FA=',
    accept: 'application/json; charset=utf-8,application/x-protobuf',
    'content-encoding': 'gzip',
    'x-xs-from-web': 'false',
    'age-range': '2',
    'sdk-version': '2',
    'passport-sdk-version': '50357',
    'x-vc-bdturing-sdk-version': '2.2.1.i18n',
    'content-type': 'application/json; charset=utf-8',
    'x-ss-stub': 'BD4D719F4B1BFD3EB12260795B7804E6',
    'x-ss-dp': '645713',
    'x-tt-trace-id': '00-c8890f0910676447999218860670ffff-c8890f0910676447-01',
    'user-agent': 'com.worldance.drama/49819 (Linux; U; Android 14; in; M2101K7BNY; Build/UP1A.230905.011; Cronet/TTNetVersion:8f366453 2024-12-24 QuicVersion:ef6c341e 2024-11-14)',
    'accept-encoding': 'gzip, deflate',
  };
}

function buildSeriesParams() {
  return {
    iid: '7577577407016814353',
    device_id: '7450158408484292102',
    ac: 'wifi',
    channel: 'gp',
    aid: '645713',
    app_name: 'Melolo',
    version_code: '49819',
    version_name: '4.9.8',
    device_platform: 'android',
    os: 'android',
    ssmix: 'a',
    device_type: 'M2101K7BNY',
    device_brand: 'Redmi',
    language: 'in',
    os_api: '34',
    os_version: '14',
    openudid: 'e6b0dca8002e9072',
    manifest_version_code: '49819',
    resolution: '1080*2263',
    dpi: '440',
    update_version_code: '49819',
    _rticket: '1764301010391',
    current_region: 'ID',
    carrier_region: 'id',
    app_language: 'id',
    sys_language: 'in',
    app_region: 'ID',
    sys_region: 'ID',
    mcc_mnc: '51010',
    carrier_region_v2: '510',
    user_language: 'id',
    time_zone: 'Asia/Makassar',
    ui_language: 'in',
    cdid: '4ea1f05f-e317-401a-9419-a25ca0b71190',
  };
}

app.get('/series', async (req, res) => {
  const seriesId = req.query.series_id;
  if (!seriesId) {
    return res.status(400).json({ error: 'Parameter ?series_id wajib diisi' });
  }

  try {
    const headers = buildSeriesHeaders();
    const params = buildSeriesParams();

    const jsonData = {
      biz_param: {
        detail_page_version: 0,
        from_video_id: '',
        need_all_video_definition: false,
        need_mp4_align: false,
        source: 4,
        use_os_player: false,
        video_id_type: 1,
      },
      series_id: String(seriesId),
    };

    const resp = await axios.post(
      `${BASE_URL}/novel/player/video_detail/v1/`,
      jsonData,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;
    const baseResp = data.BaseResp || {};

    if (baseResp.StatusCode !== 0 && baseResp.StatusCode != null) {
      return res.status(400).json({
        error: baseResp.StatusMessage || 'Upstream base error',
      });
    }

    const videoData = (data.data || {}).video_data || {};

    const seriesInfo = {
      series_id: videoData.series_id,
      title: videoData.series_title,
      intro: videoData.series_intro,
      episode_count: videoData.episode_cnt,
      episode_text: videoData.episode_right_text,
      play_count: videoData.series_play_cnt,
      cover: videoData.series_cover,
      status: videoData.series_status,
    };

    const episodes = [];
    for (const v of (videoData.video_list || [])) {
      episodes.push({
        index: v.vid_index,
        vid: v.vid,
        duration: v.duration,
        likes: v.digged_count,
        cover: v.episode_cover,
        vertical: v.vertical,
        disclaimer: (v.disclaimer_info || {}).content,
      });
    }

    const vidList = episodes
      .map((e) => e.vid)
      .filter(Boolean);

    return res.json({
      series: seriesInfo,
      episodes,
      vid_list: vidList,
    });
  } catch (err) {
    console.error('/series error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// ============================================================
// BAGIAN 3: VIDEO MODEL
// ============================================================

function buildVideoHeaders() {
  return {
    Host: 'api31-normal-myb.tmtreader.com',
    cookie: 'msToken=26RW-eVEXYtsqutQ6yCFe3QxbMsk4w-KMOvEewCAynDl7GOkevNqoFRDUEf9lyQT...',
    accept: 'application/json; charset=utf-8,application/x-protobuf',
    'x-xs-from-web': 'false',
    'age-range': '2',
    'sdk-version': '2',
    'passport-sdk-version': '50357',
    'x-vc-bdturing-sdk-version': '2.2.1.i18n',
    'x-ss-dp': '645713',
    'x-tt-trace-id': '00-c86b32d410676447999218860633ffff-c86b32d410676447-01',
    'user-agent': 'com.worldance.drama/49819 (Linux; U; Android 14; in; M2101K7BNY; Build/UP1A.230905.011; Cronet/TTNetVersion:8f366453 2024-12-24 QuicVersion:ef6c341e 2024-11-14)',
    'accept-encoding': 'gzip, deflate',
    'x-argus': 'snrz3tc+kqzdOn/A6G8fyFFJb+fyYj3zKsLGRU8r4yG7QJG2CgOKriwjWQj56fbQAL+rw3U2...',
    'x-gorgon': '8404205d100004726734efd425adb23ba6615df571b75f667aa4',
    'x-khronos': '1764299058',
    'x-ladon': 'wp/jSSMvg4rPFJxvzGmnhJEGTl1lZQYJ0YzFmo4EMsFlOold',
  };
}

function buildVideoParams() {
  return {
    iid: '7577577407016814353',
    device_id: '7450158408484292102',
    ac: 'wifi',
    channel: 'gp',
    aid: '645713',
    app_name: 'Melolo',
    version_code: '49819',
    version_name: '4.9.8',
    device_platform: 'android',
    os: 'android',
    ssmix: 'a',
    device_type: 'M2101K7BNY',
    device_brand: 'Redmi',
    language: 'in',
    os_api: '34',
    os_version: '14',
    openudid: 'e6b0dca8002e9072',
    manifest_version_code: '49819',
    resolution: '1080*2263',
    dpi: '440',
    update_version_code: '49819',
    _rticket: '1764301010391',
    current_region: 'ID',
    carrier_region: 'id',
    app_language: 'id',
    sys_language: 'in',
    app_region: 'ID',
    sys_region: 'ID',
    mcc_mnc: '51010',
    carrier_region_v2: '510',
    user_language: 'id',
    time_zone: 'Asia/Makassar',
    ui_language: 'in',
    cdid: '4ea1f05f-e317-401a-9419-a25ca0b71190',
  };
}

app.get('/video', async (req, res) => {
  const videoId = req.query.video_id;
  if (!videoId) {
    return res.status(400).json({ error: 'Parameter ?video_id wajib diisi' });
  }

  try {
    const headers = buildVideoHeaders();
    const params = buildVideoParams();

    const jsonData = {
      biz_param: {
        detail_page_version: 0,
        device_level: 3,
        from_video_id: '',
        need_all_video_definition: true,
        need_mp4_align: false,
        source: 4,
        use_os_player: false,
        video_id_type: 0,
        video_platform: 3,
      },
      video_id: String(videoId),
    };

    const resp = await axios.post(
      `${BASE_URL}/novel/player/video_model/v1/`,
      jsonData,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;
    const baseResp = data.BaseResp || {};

    if (baseResp.StatusCode !== 0 && baseResp.StatusCode != null) {
      return res.status(400).json({
        error: baseResp.StatusMessage || 'Upstream base error',
      });
    }

    const summary = {
      duration: data.data?.duration,
      video_id: String(videoId),
    };

    return res.json({
      summary,
      raw: data,
    });
  } catch (err) {
    console.error('/video error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// ============================================================
// BAGIAN 4: BOOKMALL CELL CHANGE
// ============================================================

function buildBookmallHeaders() {
  return {
    Host: 'api31-normal-myb.tmtreader.com',
    cookie: 'install_id=7577577407016814353; ttreq=1$a57165fe...; odin_tt=69bad342...; msToken=26RW-eVEXYtsqutQ6yCFe3Qx...',
    accept: 'application/json; charset=utf-8,application/x-protobuf',
    'x-xs-from-web': 'false',
    'age-range': '2',
    'sdk-version': '2',
    'passport-sdk-version': '50357',
    'x-vc-bdturing-sdk-version': '2.2.1.i18n',
    'x-ss-dp': '645713',
    'x-tt-trace-id': '00-c86b32d410676447999218860633ffff-c86b32d410676447-01',
    'user-agent': 'com.worldance.drama/49819 (Linux; U; Android 14; in; M2101K7BNY; Build/UP1A.230905.011; Cronet/TTNetVersion:8f366453 2024-12-24 QuicVersion:ef6c341e 2024-11-14)',
    'accept-encoding': 'gzip, deflate',
  };
}

function buildBookmallParams() {
  // ini diambil dari versi FastAPI, disingkat di sini
  return {
    iid: '7577577407016814353',
    device_id: '7450158408484292102',
    ac: 'wifi',
    channel: 'gp',
    aid: '645713',
    app_name: 'Melolo',
    version_code: '49819',
    version_name: '4.9.8',
    device_platform: 'android',
    os: 'android',
    ssmix: 'a',
    device_type: 'M2101K7BNY',
    device_brand: 'Redmi',
    language: 'in',
    os_api: '34',
    os_version: '14',
    openudid: 'e6b0dca8002e9072',
    manifest_version_code: '49819',
    resolution: '1080*2263',
    dpi: '440',
    update_version_code: '49819',
    _rticket: '1764301010391',
    current_region: 'ID',
    carrier_region: 'id',
    app_language: 'id',
    sys_language: 'in',
    app_region: 'ID',
    sys_region: 'ID',
    mcc_mnc: '51010',
    carrier_region_v2: '510',
    user_language: 'id',
    time_zone: 'Asia/Makassar',
    ui_language: 'in',
    cdid: '4ea1f05f-e317-401a-9419-a25ca0b71190',
    tab_scene: '3',
    tab_type: '0',
    limit: '0',
    start_offset: '0',
    cell_id: '7450059162446200848',
  };
}

app.get('/bookmall', async (_req, res) => {
  try {
    const headers = buildBookmallHeaders();
    const params = buildBookmallParams();

    const resp = await axios.get(
      `${BASE_URL}/i18n_novel/bookmall/cell/change/v1/`,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;

    if (data.code && data.code !== 0) {
      return res.status(400).json({
        error: data.message || 'Upstream returned non-zero code',
      });
    }

    // Di FastAPI: return data["data"]
    return res.json(data.data || {});
  } catch (err) {
    console.error('/bookmall error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`Melolo Express API running on http://0.0.0.0:${PORT}`);
});
