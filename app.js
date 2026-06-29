// StockMeta Generator - Zero-cost metadata generator
class StockMetaApp {
    constructor() {
        this.files = [];
        this.results = [];
        this.processing = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.log('StockMeta ready. Drop files to start.', 'info');
    }

    bindEvents() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
    }

    handleFiles(fileList) {
        const validExts = ['svg','eps','ai','jpg','jpeg','png','gif','webp','zip','pdf','psd','cdr'];
        
        Array.from(fileList).forEach(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (validExts.includes(ext)) {
                this.files.push({ file, id: crypto.randomUUID(), status: 'pending' });
            } else {
                this.log('Skipped: ' + file.name + ' (unsupported)', 'fail');
            }
        });

        if (this.files.length > 0) {
            document.getElementById('apiSection').style.display = 'block';
            document.getElementById('progressSection').style.display = 'block';
            document.getElementById('resultsSection').style.display = 'block';
            document.getElementById('logSection').style.display = 'block';
            this.log('Added ' + this.files.length + ' file(s)', 'done');
            this.processFiles();
        }
    }

    async processFiles() {
        if (this.processing) return;
        this.processing = true;
        this.results = [];

        const total = this.files.length;
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const downloadBtn = document.getElementById('downloadBtn');
        downloadBtn.style.display = 'none';

        for (let i = 0; i < this.files.length; i++) {
            const fileObj = this.files[i];
            progressFill.style.width = ((i + 1) / total * 100) + '%';
            progressText.textContent = 'Processing ' + fileObj.file.name + '... (' + (i+1) + '/' + total + ')';
            this.log('Processing: ' + fileObj.file.name, 'info');

            try {
                const metadata = await this.generateMetadata(fileObj);
                fileObj.status = 'done';
                this.results.push({ ...metadata, fileName: fileObj.file.name, fileId: fileObj.id });
                this.log('Done: ' + fileObj.file.name, 'done');
            } catch (err) {
                fileObj.status = 'fail';
                this.log('Failed: ' + fileObj.file.name + ' - ' + err.message, 'fail');
                // Add fallback result
                const fallback = this.makeFallback(fileObj);
                this.results.push(fallback);
            }

            if (i < this.files.length - 1) await this.delay(1500);
        }

        this.processing = false;
        progressText.textContent = 'Complete! ' + this.results.length + '/' + total + ' done.';
        downloadBtn.style.display = 'inline-flex';
        this.renderResults();
    }

    async generateMetadata(fileObj) {
        const apiKey = document.getElementById('apiKey').value.trim();
        const info = await this.getFileInfo(fileObj.file);

        // Try AI first if key provided, else use local
        if (apiKey) {
            try {
                const aiResult = await this.tryAI(apiKey, info);
                if (aiResult) return aiResult;
            } catch (e) {
                this.log('AI failed, using local fallback', 'info');
            }
        }
        
        return this.makeFallback(fileObj, info);
    }

    async getFileInfo(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const info = {
            name: file.name,
            ext: ext,
            type: this.fileType(ext),
            size: this.formatSize(file.size),
            cleanName: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
        };

        if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
            try {
                const dims = await this.getImageDims(file);
                info.dims = dims;
            } catch (e) {}
        }
        return info;
    }

    getImageDims(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth + 'x' + img.naturalHeight); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(); };
            img.src = url;
        });
    }

    fileType(ext) {
        const map = {
            svg: 'Vector', eps: 'Vector', ai: 'Vector', cdr: 'Vector',
            jpg: 'Photo', jpeg: 'Photo', png: 'Image', gif: 'Image', webp: 'Image',
            zip: 'Archive', pdf: 'Document', psd: 'Photoshop'
        };
        return map[ext] || 'File';
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B','KB','MB','GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async tryAI(apiKey, info) {
        const prompt = `Generate stock photo metadata for: "${info.cleanName}" (${info.type}).

Format EXACTLY:
TITLE: [catchy title under 200 chars]
DESC: [detailed description under 200 words, SEO optimized]
CAT: [one: Abstract,Animals,Backgrounds,Business,Celebrations,Education,Food,Health,Holidays,Icons,Illustrations,Industrial,Nature,People,Technology,Textures,Transport,Travel,Vectors,Vintage]
KEYS: [50 comma-separated keywords, high search volume]
STYLE: [Photographic/Vector/Illustration/3D/Watercolor/Flat/Line/Minimalist/Retro/Modern]
MOOD: [Happy/Professional/Calm/Energetic/Romantic/Serious/Playful/Elegant/Futuristic]

No extra text.`;

        // Try Gemini first
        try {
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 800, temperature: 0.6 }
                })
            });
            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (text) return this.parseAI(text, info);
            }
        } catch (e) {}

        // Fallback to HuggingFace
        try {
            const res = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 800, temperature: 0.6 } })
            });
            if (res.ok) {
                const data = await res.json();
                const text = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
                if (text) return this.parseAI(text, info);
            }
        } catch (e) {}

        return null;
    }

    parseAI(text, info) {
        const meta = {
            title: '', description: '', category: '', keywords: [],
            style: '', mood: '', usage: 'Commercial', season: 'All Seasons',
            fileName: info.name
        };

        const lines = text.split('\n');
        let current = null;

        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;

            if (t.startsWith('TITLE:')) { meta.title = t.replace('TITLE:', '').trim(); current = 'title'; }
            else if (t.startsWith('DESC:')) { meta.description = t.replace('DESC:', '').trim(); current = 'desc'; }
            else if (t.startsWith('CAT:')) { meta.category = t.replace('CAT:', '').trim(); current = 'cat'; }
            else if (t.startsWith('KEYS:')) {
                const k = t.replace('KEYS:', '').trim();
                meta.keywords = k.split(',').map(x => x.trim()).filter(x => x);
                current = 'keys';
            }
            else if (t.startsWith('STYLE:')) { meta.style = t.replace('STYLE:', '').trim(); current = 'style'; }
            else if (t.startsWith('MOOD:')) { meta.mood = t.replace('MOOD:', '').trim(); current = 'mood'; }
            else if (current && current !== 'keys') { meta[current] += ' ' + t; }
        }

        if (meta.keywords.length === 0) meta.keywords = this.makeKeywords(info);
        meta.title = meta.title.substring(0, 200);
        meta.description = meta.description.substring(0, 2000);
        meta.keywords = meta.keywords.slice(0, 50);
        return meta;
    }

    makeFallback(fileObj, info) {
        const i = info || { name: fileObj.file.name, cleanName: fileObj.file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '), type: 'File' };
        return {
            title: i.cleanName + ' - Premium ' + i.type + ' for Stock',
            description: 'High-quality ' + i.type.toLowerCase() + ' file: ' + i.cleanName + '. Professional design suitable for commercial and editorial use. Clean, scalable, and ready for print or digital projects. Compatible with all major stock platforms.',
            category: this.guessCategory(i.cleanName),
            keywords: this.makeKeywords(i),
            style: 'Professional',
            mood: 'Neutral',
            usage: 'Commercial',
            season: 'All Seasons',
            fileName: i.name
        };
    }

    makeKeywords(info) {
        const words = info.cleanName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const type = info.type.toLowerCase();
        const base = ['stock', 'vector', 'illustration', 'design', 'graphic', 'template', 'background', 'clipart', 'digital', 'creative', 'professional', 'commercial', 'royalty', 'high quality', 'modern', 'clean'];
        const all = [...new Set([...words, ...base, type])];
        return all.slice(0, 50);
    }

    guessCategory(name) {
        const n = name.toLowerCase();
        const cats = [
            ['abstract', 'Abstract'], ['animal', 'Animals'], ['background', 'Backgrounds'],
            ['business', 'Business'], ['celebration', 'Celebrations'], ['education', 'Education'],
            ['food', 'Food'], ['health', 'Health'], ['holiday', 'Holidays'], ['icon', 'Icons'],
            ['nature', 'Nature'], ['people', 'People'], ['technology', 'Technology'],
            ['texture', 'Textures'], ['transport', 'Transport'], ['travel', 'Travel'],
            ['vintage', 'Vintage'], ['pattern', 'Backgrounds'], ['floral', 'Nature'],
            ['geometric', 'Abstract'], ['watercolor', 'Illustrations'], ['logo', 'Icons']
        ];
        for (const [k, v] of cats) if (n.includes(k)) return v;
        return 'Illustrations';
    }

    renderResults() {
        const grid = document.getElementById('resultsGrid');
        grid.innerHTML = '';

        this.results.forEach((r, idx) => {
            const card = document.createElement('div');
            card.className = 'result-card';
            card.innerHTML = `
                <div class="result-header">
                    <div class="result-title">${r.fileName}</div>
                    <div class="result-status status-done">Done</div>
                </div>
                <div class="meta-field">
                    <div class="meta-label">Title</div>
                    <div class="meta-value">${r.title}</div>
                </div>
                <div class="meta-field">
                    <div class="meta-label">Description</div>
                    <div class="meta-value">${r.description}</div>
                </div>
                <div class="meta-field">
                    <div class="meta-label">Category</div>
                    <div class="meta-value">${r.category}</div>
                </div>
                <div class="meta-field">
                    <div class="meta-label">Keywords (${r.keywords.length})</div>
                    <div class="meta-value keywords">
                        ${r.keywords.map(k => `<span class="keyword-tag">${k}</span>`).join('')}
                    </div>
                </div>
                <div class="meta-field">
                    <div class="meta-label">Style / Mood / Usage</div>
                    <div class="meta-value">${r.style} | ${r.mood} | ${r.usage}</div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    log(msg, type) {
        const logContent = document.getElementById('logContent');
        const entry = document.createElement('div');
        entry.className = 'log-entry log-' + type;
        entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
        logContent.appendChild(entry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new StockMetaApp(); });

function downloadAll() {
    if (!app || app.results.length === 0) return;

    // CSV
    const headers = ['File Name','Title','Description','Category','Keywords','Style','Mood','Usage'];
    const rows = app.results.map(r => [
        r.fileName,
        '"' + (r.title || '').replace(/"/g, '""') + '"',
        '"' + (r.description || '').replace(/"/g, '""') + '"',
        r.category,
        '"' + (r.keywords || []).join(', ') + '"',
        r.style,
        r.mood,
        r.usage
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadBlob(csv, 'stockmeta-metadata.csv', 'text/csv');

    // TXT
    let txt = 'STOCKMETA METADATA EXPORT\n';
    txt += '=========================\n\n';
    app.results.forEach(r => {
        txt += 'FILE: ' + r.fileName + '\n';
        txt += 'TITLE: ' + r.title + '\n';
        txt += 'DESCRIPTION: ' + r.description + '\n';
        txt += 'CATEGORY: ' + r.category + '\n';
        txt += 'KEYWORDS: ' + r.keywords.join(', ') + '\n';
        txt += 'STYLE: ' + r.style + ' | MOOD: ' + r.mood + ' | USAGE: ' + r.usage + '\n';
        txt += '---\n\n';
    });
    downloadBlob(txt, 'stockmeta-metadata.txt', 'text/plain');

    app.log('Downloaded CSV + TXT files', 'done');
}

function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
