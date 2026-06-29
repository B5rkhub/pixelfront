// PixelFront — Güvenlik fonksiyonları birim testleri
// Çalıştır: node tests/security.test.js
// _esc ve _safeImgSrc, kullanıcı verisinin innerHTML'e basılmadan
// önce stored-XSS'e karşı korunmasını sağlar.

function _esc(str){
  if(str===null||str===undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function _safeImgSrc(url){
  if(!url||typeof url!=='string') return '';
  const u=url.trim();
  if(/^https?:\/\//i.test(u)||/^data:image\//i.test(u)) return _esc(u);
  return '';
}

let passed=0, failed=0;
function assert(desc, actual, expected){
  const ok = actual===expected;
  if(ok){ passed++; console.log(`  ✓ ${desc}`); }
  else{ failed++; console.error(`  ✗ ${desc}\n    beklenen: ${JSON.stringify(expected)}\n    alınan:   ${JSON.stringify(actual)}`); }
}

// ── _esc: XSS karakterleri ────────────────────────────────────────────
console.log('\n_esc — XSS koruması:');
assert('< kaçışlanır',          _esc('<script>'),         '&lt;script&gt;');
assert('> kaçışlanır',          _esc('<img>'),            '&lt;img&gt;');
assert('& kaçışlanır',          _esc('a&b'),              'a&amp;b');
assert('" kaçışlanır',          _esc('"quote"'),          '&quot;quote&quot;');
assert("' kaçışlanır",          _esc("it's"),             "it&#39;s");
assert('XSS payload engellenir',
  _esc('<img src=x onerror=alert(1)>'),
  '&lt;img src=x onerror=alert(1)&gt;');
assert('script tag engellenir',
  _esc('<script>alert("xss")</script>'),
  '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

// ── _esc: sınır değerleri ─────────────────────────────────────────────
console.log('\n_esc — sınır değerleri:');
assert('null → boş string',     _esc(null),               '');
assert('undefined → boş string',_esc(undefined),          '');
assert('sayı → string',         _esc(42),                 '42');
assert('normal metin değişmez', _esc('Merhaba Dünya'),   'Merhaba Dünya');
assert('boş string kalır',      _esc(''),                 '');

// ── _safeImgSrc: izin verilen şemalar ────────────────────────────────
console.log('\n_safeImgSrc — izin verilen şemalar:');
assert('https:// geçer',
  _safeImgSrc('https://example.com/photo.jpg'),
  'https://example.com/photo.jpg');
assert('http:// geçer',
  _safeImgSrc('http://example.com/img.png'),
  'http://example.com/img.png');
assert('data:image/ geçer',
  _safeImgSrc('data:image/png;base64,abc123'),
  'data:image/png;base64,abc123');
assert('HTTPS büyük harf geçer',
  _safeImgSrc('HTTPS://example.com/img.jpg'),
  'HTTPS://example.com/img.jpg');

// ── _safeImgSrc: tehlikeli şemalar reddedilir ─────────────────────────
console.log('\n_safeImgSrc — tehlikeli şemalar reddedilir:');
assert('javascript: reddedilir',
  _safeImgSrc('javascript:alert(1)'),   '');
assert('vbscript: reddedilir',
  _safeImgSrc('vbscript:msgbox(1)'),    '');
assert('data:text/ reddedilir',
  _safeImgSrc('data:text/html,<h1>xss'),  '');
assert('göreli URL reddedilir',
  _safeImgSrc('../etc/passwd'),         '');
assert('boş string → boş string',
  _safeImgSrc(''),                      '');
assert('null → boş string',
  _safeImgSrc(null),                    '');
assert('sayı → boş string',
  _safeImgSrc(123),                     '');

// ── _safeImgSrc: URL içindeki XSS kaçışlanır ──────────────────────────
console.log('\n_safeImgSrc — URL XSS kaçışlama:');
assert('çift tırnak URL\'de kaçışlanır',
  _safeImgSrc('https://example.com/a"b.jpg'),
  'https://example.com/a&quot;b.jpg');

// ── Sonuç ─────────────────────────────────────────────────────────────
console.log(`\n${passed} geçti, ${failed} başarısız — ${passed+failed} testin tümü\n`);
process.exit(failed > 0 ? 1 : 0);
