const App = {
    history: [],
    historyIndex: -1,
    maxHistory: 20,
    saveTimeout: null,

    init: function() {
        Builder.init();
        this.setupEventListeners();
        this.setupTerminal();
        this.loadProject();
        // Initial save
        this.saveState(); 
        this.updateCode();
    },

    loadProject: function() {
        const saved = localStorage.getItem('vuc_project');
        if (saved) {
            Builder.loadHTML(saved);
        } else {
            // Default content
            Builder.canvas.innerHTML = `
                <div class="dropped-element" style="padding: 40px; text-align: center; color: #555; border: 2px dashed #ccc; border-radius: 8px; margin: 20px;">
                    <h2 class="dropped-element">Welcome to Visual UI Code</h2>
                    <p class="dropped-element">Drag components from the left sidebar to start building.</p>
                    <button class="dropped-element btn" style="margin-top: 10px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px;">Example Button</button>
                </div>
            `;
        }
    },

    setupEventListeners: function() {
        // Toolbar
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        document.getElementById('btn-save').addEventListener('click', () => this.saveProject());
        document.getElementById('btn-export').addEventListener('click', () => this.exportProject());
        
        // Code Editor Live Sync
        document.getElementById('code-editor').addEventListener('input', () => this.syncCodeToCanvas());

        // View modes
        document.getElementById('btn-desktop').addEventListener('click', () => this.setViewMode('desktop'));
        document.getElementById('btn-tablet').addEventListener('click', () => this.setViewMode('tablet'));
        document.getElementById('btn-mobile').addEventListener('click', () => this.setViewMode('mobile'));

        // Code Tabs
        const tabs = document.querySelectorAll('.code-tabs button');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelector('.code-tabs button.active').classList.remove('active');
                e.target.classList.add('active');
                this.updateCodeView(e.target.dataset.lang);
            });
        });
    },

    setViewMode: function(mode) {
        const canvas = document.getElementById('preview-canvas');
        canvas.className = 'preview-canvas ' + mode;
        document.getElementById('preview-size-label').innerText = mode.charAt(0).toUpperCase() + mode.slice(1);
    },

    updatePropertyInspector: function(el) {
        const container = document.getElementById('property-inspector');
        container.innerHTML = '';

        if (!el) {
            container.innerHTML = '<div class="no-selection">Select an element to edit properties</div>';
            return;
        }

        const createGroup = (title, inputs) => {
            const group = document.createElement('div');
            group.className = 'prop-group';
            group.innerHTML = `<div class="panel-header" style="padding-left:0; border:none; background:transparent; margin-bottom:5px;">${title}</div>`;
            inputs.forEach(input => group.appendChild(input));
            container.appendChild(group);
        };

        const createInput = (label, value, onChange, type='text') => {
            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = '8px';
            
            const lbl = document.createElement('label');
            lbl.className = 'prop-label';
            lbl.innerText = label;
            
            const inp = document.createElement('input');
            inp.className = 'prop-input';
            inp.type = type;
            inp.value = value || '';
            
            const update = (e) => {
                onChange(e.target.value);
                this.updateCode(); // Update code on change
            };
            
            inp.onchange = (e) => {
                update(e);
                this.saveState(); // Save state on commit
            };
            inp.oninput = update; // Live preview

            wrapper.appendChild(lbl);
            wrapper.appendChild(inp);
            return wrapper;
        };

        // Identity
        createGroup('Identity', [
            createInput('ID', el.id, (v) => el.id = v),
            createInput('Classes', el.className.replace('dropped-element', '').replace('selected', '').trim(), (v) => {
                el.className = 'dropped-element selected ' + v;
            })
        ]);
        
        // Content
        if (!['input', 'img', 'hr', 'br', 'video'].includes(el.tagName.toLowerCase())) {
             createGroup('Content', [
                createInput('Text', el.innerText, (v) => el.innerText = v)
            ]);
        }
        
        if (el.tagName.toLowerCase() === 'img') {
            createGroup('Image Source', [
                createInput('Src', el.getAttribute('src'), (v) => el.setAttribute('src', v))
            ]);
        }

        // Styles
        const s = el.style;
        createGroup('Layout', [
            createInput('Width', s.width, (v) => s.width = v),
            createInput('Height', s.height, (v) => s.height = v),
            createInput('Padding', s.padding, (v) => s.padding = v),
            createInput('Margin', s.margin, (v) => s.margin = v),
            createInput('Display', s.display, (v) => s.display = v)
        ]);

        createGroup('Appearance', [
            createInput('Background', s.backgroundColor, (v) => s.backgroundColor = v),
            createInput('Color', s.color, (v) => s.color = v),
            createInput('Font Size', s.fontSize, (v) => s.fontSize = v),
            createInput('Border', s.border, (v) => s.border = v),
            createInput('Border Radius', s.borderRadius, (v) => s.borderRadius = v)
        ]);
    },

    updateCode: function() {
        const activeTab = document.querySelector('.code-tabs button.active').dataset.lang;
        this.updateCodeView(activeTab);
    },

    syncCodeToCanvas: function() {
        const editor = document.getElementById('code-editor');
        const code = editor.value;
        const activeTab = document.querySelector('.code-tabs button.active').dataset.lang;
        
        if (activeTab === 'html') {
            // Extract body content if wrapped in <html><body>...</body></html>
            let bodyContent = code;
            if (code.includes('<body')) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(code, 'text/html');
                bodyContent = doc.body.innerHTML;
            }
            
            // Only update if content changed significantly (simple check)
            // But we need to be careful not to lose selection/focus if we were re-rendering,
            // though here we are updating the preview canvas, not the editor itself.
            // The editor is where the user is typing.
            
            Builder.loadHTML(bodyContent);
            
            // Note: We don't call saveState() here on every keystroke to avoid flooding history
            // We can debounce it or let the user manually save/blur?
            // For now, let's debounce save.
            this.saveStateDebounced();
        }
    },

    updateCodeView: function(lang) {
        const editor = document.getElementById('code-editor');
        if (lang === 'html') {
            let html = Builder.getHTML();
            let fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>My Project</title>
<style>body { font-family: sans-serif; }</style>
</head>
<body>
${html}
</body>
</html>`;
            editor.value = this.formatHTML(fullHtml);
        } else if (lang === 'css') {
            editor.value = "/* Styles are currently inline in HTML. \n   Export to extract to CSS. */";
        } else if (lang === 'js') {
            editor.value = "// Custom JavaScript";
        }
    },

    formatHTML: function(html) {
        let formatted = '';
        let pad = 0;
        html.split(/>\s*</).forEach(function(node) {
            if (node.match( /^\/\w/ )) pad -= 1;
            formatted += new Array(pad + 1).join('  ') + '<' + node + '>\r\n';
            if (node.match( /^<?\w[^>]*[^\/]$/ ) && !node.startsWith('input') && !node.startsWith('img') && !node.startsWith('br')) pad += 1;
        });
        return formatted.trim();
    },

    // History / Undo / Redo
    saveState: function() {
        // Debounce if needed, but for now simple
        const currentHTML = Builder.getHTML();
        
        // If same as current state, skip
        if (this.historyIndex >= 0 && this.history[this.historyIndex] === currentHTML) return;

        // Truncate future history if we were in the middle
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        this.history.push(currentHTML);
        if (this.history.length > this.maxHistory) this.history.shift();
        else this.historyIndex++;
        
        this.updateUndoRedoButtons();
    },
    
    // Call this when dragging stops or input blurs
    saveStateDebounced: function() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveState(), 500);
    },

    undo: function() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            Builder.loadHTML(this.history[this.historyIndex]);
            this.updateCode();
            this.updateUndoRedoButtons();
            Builder.deselectElement();
        }
    },

    redo: function() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            Builder.loadHTML(this.history[this.historyIndex]);
            this.updateCode();
            this.updateUndoRedoButtons();
            Builder.deselectElement();
        }
    },

    updateUndoRedoButtons: function() {
        document.getElementById('btn-undo').disabled = this.historyIndex <= 0;
        document.getElementById('btn-redo').disabled = this.historyIndex >= this.history.length - 1;
        document.getElementById('btn-undo').style.opacity = this.historyIndex <= 0 ? 0.5 : 1;
        document.getElementById('btn-redo').style.opacity = this.historyIndex >= this.history.length - 1 ? 0.5 : 1;
    },

    // Terminal
    setupTerminal: function() {
        const input = document.getElementById('terminal-input');
        const output = document.getElementById('terminal-output');
        const btn = document.getElementById('btn-run-cmd');

        const execute = async () => {
            const cmd = input.value.trim();
            if (!cmd) return;

            // Echo command
            output.innerHTML += `<div class="terminal-line"><span style="color:#007acc">$</span> ${cmd}</div>`;
            input.value = '';
            
            // Scroll to bottom
            output.scrollTop = output.scrollHeight;

            try {
                const response = await fetch('/api/run_command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: cmd })
                });
                
                const data = await response.json();
                
                if (data.stdout) {
                    output.innerHTML += `<div class="terminal-line">${data.stdout}</div>`;
                }
                if (data.stderr) {
                    output.innerHTML += `<div class="terminal-line" style="color:red">${data.stderr}</div>`;
                }
                if (data.error) {
                    output.innerHTML += `<div class="terminal-line" style="color:red">Error: ${data.error}</div>`;
                }
            } catch (err) {
                output.innerHTML += `<div class="terminal-line" style="color:red">Network Error: ${err.message}</div>`;
            }
            output.scrollTop = output.scrollHeight;
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') execute();
        });
        
        btn.addEventListener('click', execute);
    },

    saveProject: async function() {
        // Save to local storage for now, or backend if needed
        const html = Builder.getHTML();
        localStorage.setItem('vuc_project', html);
        alert('Project saved to local storage!');
    },

    exportProject: function() {
        const html = Builder.getHTML();
        const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Exported Project</title>
    <style>body { font-family: sans-serif; }</style>
</head>
<body>
${html}
</body>
</html>`;
        
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

window.onload = () => App.init();
window.App = App;
