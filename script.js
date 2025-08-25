(() => {
  const fileInput = document.getElementById('fileInput');
  const maxWidthInput = document.getElementById('maxWidth');
  const maxWidthValue = document.getElementById('maxWidthValue');
  const charsetSelect = document.getElementById('charset');
  const invertCheckbox = document.getElementById('invert');
  const scaleYInput = document.getElementById('scaleY');
  const scaleYValue = document.getElementById('scaleYValue');
  const contrastInput = document.getElementById('contrast');
  const contrastValue = document.getElementById('contrastValue');
  const coloredCheckbox = document.getElementById('colored');
  const fontSizeInput = document.getElementById('fontSize');
  const fontSizeValue = document.getElementById('fontSizeValue');
  const brightnessInput = document.getElementById('brightness');
  const brightnessValue = document.getElementById('brightnessValue');
  const ditherCheckbox = document.getElementById('dither');
  const lineHeightInput = document.getElementById('lineHeight');
  const lineHeightValue = document.getElementById('lineHeightValue');
  const letterSpacingInput = document.getElementById('letterSpacing');
  const letterSpacingValue = document.getElementById('letterSpacingValue');
  const customCharsetInput = document.getElementById('customCharset');
  const useCustomCharsetCheckbox = document.getElementById('useCustomCharset');
  const smoothingCheckbox = document.getElementById('smoothing');
  const pngTransparentCheckbox = document.getElementById('pngTransparent');

  const btnRender = document.getElementById('btnRender');
  const btnCopy = document.getElementById('btnCopy');
  const btnDownload = document.getElementById('btnDownload');
  const btnDownloadPng = document.getElementById('btnDownloadPng');

  const asciiOut = document.getElementById('asciiOut');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const dropzone = document.getElementById('dropzone');
  const previewImg = document.getElementById('preview');

  let loadedImageBitmap = null;
  let lastObjectUrl = null;

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function applyContrast(value01, contrast){
    // contrast in [-100, 100], remap to [0, 2]
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const v = factor * (value01 * 255 - 128) + 128;
    return clamp(v / 255, 0, 1);
  }

  function brightnessOf(r, g, b){
    // Perceived luminance (Rec. 709)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function applyBrightness(value01, brightness){
    // brightness in [-100, 100] where 100 => +1.0
    const delta = brightness / 100;
    return clamp(value01 + delta, 0, 1);
  }

  function mapValueToChar(value01, charset, invert){
    const v = clamp(value01, 0, 1);
    const index = Math.round(v * (charset.length - 1));
    return invert ? charset[index] : charset[charset.length - 1 - index];
  }

  function updateUIState(hasImage){
    btnRender.disabled = !hasImage;
    btnCopy.disabled = asciiOut.textContent.length === 0;
    btnDownload.disabled = asciiOut.textContent.length === 0;
    btnDownloadPng.disabled = asciiOut.textContent.length === 0;
  }

  // Single dark theme. No theme toggle.

  async function loadImage(file){
    const blobURL = URL.createObjectURL(file);
    const img = new Image();
    img.src = blobURL;
    await img.decode();
    const bitmap = await createImageBitmap(img, { colorSpaceConversion: 'default' });
    URL.revokeObjectURL(blobURL);
    return bitmap;
  }

  function debounce(fn, wait){
    let t;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  async function renderAscii(){
    if(!loadedImageBitmap) return;

    const maxCols = parseInt(maxWidthInput.value, 10);
    const scaleY = parseFloat(scaleYInput.value);
    const contrast = parseInt(contrastInput.value, 10);
    const charset = (useCustomCharsetCheckbox.checked && customCharsetInput.value.trim().length > 1)
      ? customCharsetInput.value
      : charsetSelect.value;
    const invert = invertCheckbox.checked;
    const colored = coloredCheckbox.checked;
    const dither = ditherCheckbox.checked;
    const smoothing = smoothingCheckbox ? smoothingCheckbox.checked : true;
    const brightness = parseInt(brightnessInput.value, 10) || 0;

    const imgW = loadedImageBitmap.width;
    const imgH = loadedImageBitmap.height;

    // Compute target rows with vertical scale correction (characters are taller than wide)
    const cols = Math.max(1, Math.min(maxCols, imgW));
    const ratio = imgH / imgW;
    const rows = Math.max(1, Math.round(cols * ratio / (scaleY / 2))); // tweak factor

    canvas.width = cols;
    canvas.height = rows;

    // Draw downscaled image to canvas
    ctx.clearRect(0, 0, cols, rows);
    ctx.imageSmoothingEnabled = smoothing;
    ctx.imageSmoothingQuality = smoothing ? 'high' : 'low';
    ctx.drawImage(loadedImageBitmap, 0, 0, cols, rows);

    const imageData = ctx.getImageData(0, 0, cols, rows);
    const data = imageData.data;

    if(colored){
      // Build HTML with color spans
      let html = '';
      for(let y = 0; y < rows; y++){
        const rowOffset = y * cols * 4;
        for(let x = 0; x < cols; x++){
          const i = rowOffset + x * 4;
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          let v = brightnessOf(r, g, b);
          v = applyContrast(v, contrast);
          v = applyBrightness(v, brightness);
          const ch = mapValueToChar(v, charset, invert);
          html += `<span style="color:rgb(${r},${g},${b})">${ch}</span>`;
        }
        html += '\n';
      }
      asciiOut.innerHTML = html;
    } else {
      const levels = charset.length;
      if(dither && levels > 1){
        // Floyd–Steinberg dithering over luminance values
        const lum = new Float32Array(cols * rows);
        for(let y = 0; y < rows; y++){
          const rowOffset = y * cols * 4;
          for(let x = 0; x < cols; x++){
            const i = rowOffset + x * 4;
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            let v = brightnessOf(r, g, b);
            v = applyContrast(v, contrast);
            v = applyBrightness(v, brightness);
            lum[y*cols + x] = v;
          }
        }
        let lines = new Array(rows);
        for(let y = 0; y < rows; y++){
          let lineChars = '';
          for(let x = 0; x < cols; x++){
            const idx = y*cols + x;
            const old = lum[idx];
            const qIndex = Math.round(old * (levels - 1));
            const newVal = qIndex / (levels - 1);
            const err = old - newVal;
            const ch = mapValueToChar(newVal, charset, invert);
            lineChars += ch;
            // diffuse error
            if(x+1 < cols) lum[idx+1] += err * 7/16;
            if(y+1 < rows){
              if(x > 0) lum[idx + cols - 1] += err * 3/16;
              lum[idx + cols] += err * 5/16;
              if(x+1 < cols) lum[idx + cols + 1] += err * 1/16;
            }
          }
          lines[y] = lineChars;
        }
        asciiOut.textContent = lines.join('\n');
      } else {
        let lines = new Array(rows);
        for(let y = 0; y < rows; y++){
          let lineChars = '';
          const rowOffset = y * cols * 4;
          for(let x = 0; x < cols; x++){
            const i = rowOffset + x * 4;
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            let v = brightnessOf(r, g, b);
            v = applyContrast(v, contrast);
            v = applyBrightness(v, brightness);
            const ch = mapValueToChar(v, charset, invert);
            lineChars += ch;
          }
          lines[y] = lineChars;
        }
        asciiOut.textContent = lines.join('\n');
      }
    }

    // Apply font size
    const fs = parseInt(fontSizeInput.value, 10);
    asciiOut.style.fontSize = fs + 'px';
    // Apply typography
    const lh = parseFloat(lineHeightInput.value) || 1.0;
    const ls = parseFloat(letterSpacingInput.value) || 0;
    asciiOut.style.lineHeight = String(lh);
    asciiOut.style.letterSpacing = ls + 'px';
    updateUIState(true);
  }

  const renderAsciiDebounced = debounce(renderAscii, 120);

  function copyToClipboard(){
    const text = asciiOut.innerText || asciiOut.textContent;
    if(!text) return;
    navigator.clipboard.writeText(text).then(() => {
      btnCopy.textContent = 'Kopyalandı!';
      setTimeout(() => btnCopy.textContent = 'Kopyala', 1200);
    });
  }

  function downloadTxt(){
    const text = asciiOut.innerText || asciiOut.textContent;
    if(!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'OpenDot-Art.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadPng(){
    if(!loadedImageBitmap) return;
    const maxCols = parseInt(maxWidthInput.value, 10);
    const scaleY = parseFloat(scaleYInput.value);
    const contrast = parseInt(contrastInput.value, 10);
    const charset = charsetSelect.value;
    const invert = invertCheckbox.checked;
    const colored = coloredCheckbox.checked;

    const imgW = loadedImageBitmap.width;
    const imgH = loadedImageBitmap.height;
    const cols = Math.max(1, Math.min(maxCols, imgW));
    const ratio = imgH / imgW;
    const rows = Math.max(1, Math.round(cols * ratio / (scaleY / 2)));

    // Prepare an offscreen canvas to draw text
    const fs = parseInt(fontSizeInput.value, 10);
    const lineHeight = Math.round(fs * 1.0);
    const charWidth = Math.round(fs * 0.6); // approx for monospace
    const outCanvas = document.createElement('canvas');
    outCanvas.width = Math.max(1, cols * charWidth);
    outCanvas.height = Math.max(1, rows * lineHeight);
    const octx = outCanvas.getContext('2d');
    const transparent = pngTransparentCheckbox && pngTransparentCheckbox.checked;
    if(!transparent){
      octx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card') || '#000';
      octx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    } else {
      octx.clearRect(0, 0, outCanvas.width, outCanvas.height);
    }
    octx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    octx.textBaseline = 'top';

    // Reuse low-res buffer
    const bufCanvas = document.createElement('canvas');
    bufCanvas.width = cols;
    bufCanvas.height = rows;
    const bctx = bufCanvas.getContext('2d');
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(loadedImageBitmap, 0, 0, cols, rows);
    const id = bctx.getImageData(0, 0, cols, rows);
    const data = id.data;

    for(let y = 0; y < rows; y++){
      const rowOffset = y * cols * 4;
      for(let x = 0; x < cols; x++){
        const i = rowOffset + x * 4;
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        let v = brightnessOf(r, g, b);
        v = applyContrast(v, contrast);
        const ch = mapValueToChar(v, charset, invert);
        octx.fillStyle = colored ? `rgb(${r},${g},${b})` : '#dfe7f3';
        octx.fillText(ch, x * charWidth, y * lineHeight);
      }
    }

    outCanvas.toBlob((blob) => {
      if(!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'OpenDot-Art.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  // Event bindings
  maxWidthInput.addEventListener('input', () => {
    maxWidthValue.textContent = maxWidthInput.value;
    if(loadedImageBitmap) renderAsciiDebounced();
  });
  scaleYInput.addEventListener('input', () => {
    scaleYValue.textContent = parseFloat(scaleYInput.value).toFixed(1);
    if(loadedImageBitmap) renderAsciiDebounced();
  });
  contrastInput.addEventListener('input', () => {
    contrastValue.textContent = contrastInput.value;
    if(loadedImageBitmap) renderAsciiDebounced();
  });
  brightnessInput.addEventListener('input', () => {
    brightnessValue.textContent = brightnessInput.value;
    if(loadedImageBitmap) renderAsciiDebounced();
  });
  charsetSelect.addEventListener('change', () => { if(loadedImageBitmap) renderAsciiDebounced(); });
  invertCheckbox.addEventListener('change', () => { if(loadedImageBitmap) renderAsciiDebounced(); });
  coloredCheckbox.addEventListener('change', () => { if(loadedImageBitmap) renderAsciiDebounced(); });
  fontSizeInput.addEventListener('input', () => {
    fontSizeValue.textContent = fontSizeInput.value;
    asciiOut.style.fontSize = fontSizeInput.value + 'px';
  });
  lineHeightInput.addEventListener('input', () => {
    lineHeightValue.textContent = parseFloat(lineHeightInput.value).toFixed(2);
    asciiOut.style.lineHeight = String(lineHeightInput.value);
  });
  letterSpacingInput.addEventListener('input', () => {
    letterSpacingValue.textContent = letterSpacingInput.value;
    asciiOut.style.letterSpacing = letterSpacingInput.value + 'px';
  });
  if(ditherCheckbox) ditherCheckbox.addEventListener('change', () => { if(loadedImageBitmap) renderAsciiDebounced(); });
  if(useCustomCharsetCheckbox) useCustomCharsetCheckbox.addEventListener('change', () => { if(loadedImageBitmap) renderAsciiDebounced(); });
  if(customCharsetInput) customCharsetInput.addEventListener('input', () => { if(loadedImageBitmap && useCustomCharsetCheckbox.checked) renderAsciiDebounced(); });
  if(smoothingCheckbox) smoothingCheckbox.addEventListener('change', () => { if(loadedImageBitmap) renderAsciiDebounced(); });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file){
      loadedImageBitmap = null;
      updateUIState(false);
      return;
    }
    btnRender.disabled = true;
    asciiOut.textContent = '';
    try{
      loadedImageBitmap = await loadImage(file);
      // preview
      if(lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = URL.createObjectURL(file);
      previewImg.src = lastObjectUrl;
      previewImg.style.display = 'block';
      btnRender.disabled = false;
    } catch(err){
      console.error(err);
      alert('Görsel yüklenirken bir hata oluştu.');
    }
    updateUIState(!!loadedImageBitmap);
    renderAsciiDebounced();
  });

  btnRender.addEventListener('click', () => {
    renderAscii();
  });
  btnCopy.addEventListener('click', copyToClipboard);
  btnDownload.addEventListener('click', downloadTxt);
  btnDownloadPng.addEventListener('click', downloadPng);

  // Drag & drop
  function handleFiles(files){
    if(!files || !files.length) return;
    const file = files[0];
    if(!file.type.startsWith('image/')) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    const changeEvent = new Event('change');
    fileInput.dispatchEvent(changeEvent);
  }

  if(dropzone){
    ['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add('dragover');
    }));
    ['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.remove('dragover');
    }));
    dropzone.addEventListener('drop', (e) => {
      handleFiles(e.dataTransfer.files);
    });
  }
  // Optional: window-level drop
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });

  // Init (dark theme only)
  updateUIState(false);
  // Apply initial font size
  asciiOut.style.fontSize = (parseInt(fontSizeInput.value, 10) || 10) + 'px';
  asciiOut.style.lineHeight = String(parseFloat(lineHeightInput.value) || 1.0);
  asciiOut.style.letterSpacing = (parseFloat(letterSpacingInput.value) || 0) + 'px';
})();


