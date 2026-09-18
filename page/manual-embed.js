/* manual-embed.js (boardgame-engine): embed the game's actual print manual (manual/manual.html's generator, its CSS and every asset) into the page as a
   page-turning book, without maintaining a second copy of its rules. module.exports(GAME_DIR) -> { styles(), scripts() }. */
'use strict';
const fs = require('fs'), path = require('path');
const zlib = require('zlib');
module.exports = function (GAME_DIR) {
const read = name => fs.readFileSync(path.join(GAME_DIR, name), 'utf8');
const readEngine = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
/* Recompress the original filtered pixels, with no resampling or colour loss. */
function smallerPng(bytes) {
  const chunks = [], pixels = [];
  for (let i = 8; i < bytes.length;) {
    const size = bytes.readUInt32BE(i), chunk = bytes.subarray(i, i + size + 12);
    chunks.push(chunk);
    if (chunk.toString('ascii', 4, 8) === 'IDAT') pixels.push(chunk.subarray(8, -4));
    i += chunk.length;
  }
  const data = zlib.deflateSync(zlib.inflateSync(Buffer.concat(pixels)), { level:9 });
  const idat = Buffer.alloc(data.length + 12);
  idat.writeUInt32BE(data.length); idat.write('IDAT', 4); data.copy(idat, 8);
  idat.writeUInt32BE(zlib.crc32(idat.subarray(4, -4)), idat.length - 4);
  let written = false;
  const out = Buffer.concat([bytes.subarray(0, 8), ...chunks.flatMap(c => {
    if (c.toString('ascii', 4, 8) !== 'IDAT') return [c];
    if (written) return [];
    written = true; return [idat];
  })]);
  return out.length < bytes.length ? out : bytes;
}
const uri = name => {
  const mime = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' }[path.extname(name)];
  if (!mime) throw Error('Unsupported manual asset: ' + name);
  let bytes = fs.readFileSync(path.join(GAME_DIR, 'manual', name));
  if (mime === 'image/png') bytes = smallerPng(bytes);
  return `data:${mime};base64,${bytes.toString('base64')}`;
};

/* The manual uses ordinary rule blocks, font faces and print media. Reject new
   at-rules rather than accidentally allowing an unscoped rule onto the page. */
function scope(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) {
      if (css.slice(i).trim()) throw Error('Unparsed manual CSS');
      break;
    }
    const selector = css.slice(i, open).trim();
    let end = open + 1, depth = 1;
    for (; depth && end < css.length; end++) {
      if (css[end] === '{') depth++;
      if (css[end] === '}') depth--;
    }
    if (depth) throw Error('Unclosed manual CSS rule');
    const body = css.slice(open + 1, end - 1);
    if (selector === '@font-face') out += `${selector}{${body}}\n`;
    else if (selector.startsWith('@media ')) out += `${selector}{${scope(body)}}\n`;
    else if (selector !== '@page') {
      if (selector.startsWith('@')) throw Error('Unscoped manual CSS: ' + selector);
      out += selector.split(',').map(s => ['body', ':root'].includes(s.trim()) ? '#book' : '#book ' + s.trim()).join(',') + `{${body}}\n`;
    }
    i = end;
  }
  return out;
}
function styles() {
  const css = read('manual/manual.css').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/url\((assets\/[^)]+)\)/g, (_, file) => `url(${uri(file)})`)
    .replace(/\bFredoka\b/g, 'ManualFredoka');
  return '#book, #book :where(:not(svg, svg *)) { all:revert; box-sizing:border-box; }\n' + scope(css) + readEngine('manual-viewer.css');
}
function scripts() {
  const assets = Object.fromEntries(fs.readdirSync(path.join(GAME_DIR, 'manual/assets')).filter(f => /\.(svg|png)$/.test(f)).sort().map(f => ['assets/' + f, uri('assets/' + f)]));
  /* the manual's data files: rules-data.js (from the engine's sync) and any assets/*-data.js the game's figures read */
  const dataFiles = ['manual/rules-data.js'].concat(fs.readdirSync(path.join(GAME_DIR, 'manual/assets')).filter(f => /-data\.js$/.test(f)).sort().map(f => 'manual/assets/' + f));
  const safe = text => text.replace(/<\//g, '<\\/');
  /* Render through a small DOM adapter so even SVG <image> URLs are replaced
     before the browser sees markup. The generator itself is unchanged. */
  const generator = read('manual/manual.js').replace(/^\s*\/\/([^\n]*)$/gm, '/*$1 */');
  return dataFiles.map(f => `<script>${safe(read(f))}</script>`).join('\n') + `\n<script>(function () {
    const assets = ${safe(JSON.stringify(assets))};
    const book = window.document.getElementById('book');
    const document = { getElementById(id) {
      if (id !== 'book') throw Error('Unexpected manual target: ' + id);
      return { set innerHTML(markup) {
        book.innerHTML = markup.replace(/font-family="Fredoka"/g, 'font-family="ManualFredoka"').replace(/(src|href)="(assets\\/[^"\\s]+)"/g, (_, attr, file) => {
          if (!assets[file]) throw Error('Missing embedded manual asset: ' + file);
          return attr + '="' + assets[file] + '"';
        });
      } };
    } };
    ${safe(generator)}
  })();</script>\n<script>${safe(readEngine('manual-viewer.js'))}</script>`;
}
/* the bootstrap build, before the manual exists: the viewer alone, over an empty book (it does nothing with 0 pages expected) */
function viewerOnly() { return readEngine('manual-viewer.js').replace(/<\//g, '<\\/'); }
return { styles, scripts, viewerOnly };
};
