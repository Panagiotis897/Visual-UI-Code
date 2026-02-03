const App = {
    history: [],
    historyIndex: -1,
    maxHistory: 20,
    saveTimeout: null,
    isUpdatingCode: false,

    init: function() {
        Builder.init();
        this.setupEventListeners();
        this.setupTerminal();
        this.loadProject();
        this.initMonaco();
        this.setupResizers();
        this.loadLayout();
        // Initial save
        this.saveState(); 
        this.updateCode();
    },

    toggleCategory: function(header) {
        const category = header.parentElement;
        category.classList.toggle('collapsed');
    },

    setupResizers: function() {
        const createResizer = (resizerId, direction, onResize, onStop) => {
            const resizer = document.getElementById(resizerId);
            if (!resizer) return;

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
                resizer.classList.add('resizing');
                document.body.classList.add('is-resizing');
                
                const startX = e.clientX;
                const startY = e.clientY;
                
                const onMouseMove = (moveEvent) => {
                    onResize(moveEvent.clientX - startX, moveEvent.clientY - startY, moveEvent);
                };
                
                const onMouseUp = () => {
                    document.body.style.cursor = '';
                    resizer.classList.remove('resizing');
                    document.body.classList.remove('is-resizing');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (onStop) onStop();
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        };

        // Sidebar Resizer
        const sidebar = document.getElementById('component-sidebar');
        createResizer('resizer-sidebar', 'horizontal', (dx, dy, e) => {
            const newWidth = e.clientX; 
            if (newWidth > 150 && newWidth < 500) {
                sidebar.style.width = newWidth + 'px';
            }
        }, () => this.saveLayout());

        // Code/Preview Resizer
        const codePanel = document.getElementById('code-editor-panel');
        const previewPanel = document.getElementById('preview-panel');
        const workspace = document.querySelector('.workspace');
        
        createResizer('resizer-code', 'horizontal', (dx, dy, e) => {
            const sidebarWidth = sidebar.getBoundingClientRect().width;
            const resizerWidth = 5;
            const availableWidth = workspace.clientWidth - sidebarWidth - resizerWidth;
            
            // Calculate new width based on mouse position relative to workspace start
            // Mouse X - Sidebar Width
            let newCodeWidth = e.clientX - sidebarWidth;
            
            // Constraints
            if (newCodeWidth < 100) newCodeWidth = 100;
            if (newCodeWidth > availableWidth - 100) newCodeWidth = availableWidth - 100;
            
            const codePercent = (newCodeWidth / availableWidth) * 100;
            
            codePanel.style.flex = `0 0 ${codePercent}%`;
            previewPanel.style.flex = `0 0 ${100 - codePercent}%`;
        }, () => this.saveLayout());

        // Terminal Resizer
        const editorContent = document.getElementById('editor-content-wrapper');
        const terminal = document.getElementById('terminal-container');
        
        createResizer('resizer-terminal', 'vertical', (dx, dy, e) => {
            const codePanelRect = codePanel.getBoundingClientRect();
            const panelTop = codePanelRect.top;
            const panelHeight = codePanelRect.height;
            
            let newEditorHeight = e.clientY - panelTop;
            
            // Constraints
            if (newEditorHeight < 50) newEditorHeight = 50;
            if (newEditorHeight > panelHeight - 30) newEditorHeight = panelHeight - 30;
            
            const editorPercent = (newEditorHeight / panelHeight) * 100;
            
            editorContent.style.height = `${editorPercent}%`;
            terminal.style.height = `${100 - editorPercent}%`;
        }, () => this.saveLayout());
    },

    saveLayout: function() {
        const layout = {
            sidebarWidth: document.getElementById('component-sidebar').style.width,
            codePanelFlex: document.getElementById('code-editor-panel').style.flex,
            previewPanelFlex: document.getElementById('preview-panel').style.flex,
            editorHeight: document.getElementById('editor-content-wrapper').style.height,
            terminalHeight: document.getElementById('terminal-container').style.height
        };
        localStorage.setItem('vuc_layout', JSON.stringify(layout));
    },

    loadLayout: function() {
        try {
            const layout = JSON.parse(localStorage.getItem('vuc_layout'));
            if (layout) {
                if (layout.sidebarWidth) document.getElementById('component-sidebar').style.width = layout.sidebarWidth;
                if (layout.codePanelFlex) document.getElementById('code-editor-panel').style.flex = layout.codePanelFlex;
                if (layout.previewPanelFlex) document.getElementById('preview-panel').style.flex = layout.previewPanelFlex;
                if (layout.editorHeight) document.getElementById('editor-content-wrapper').style.height = layout.editorHeight;
                if (layout.terminalHeight) document.getElementById('terminal-container').style.height = layout.terminalHeight;
            }
        } catch(e) { console.error('Error loading layout', e); }
    },

    resetLayout: function() {
        if (confirm('Are you sure you want to reset the layout to default settings?')) {
            // Clear saved layout
            localStorage.removeItem('vuc_layout');
            
            // Reset Sidebar
            document.getElementById('component-sidebar').style.width = '';
            
            // Reset Code/Preview Split
            document.getElementById('code-editor-panel').style.flex = '';
            document.getElementById('preview-panel').style.flex = '';
            
            // Reset Editor/Terminal Split
            document.getElementById('editor-content-wrapper').style.height = '';
            document.getElementById('terminal-container').style.height = '';
            
            // Feedback
            alert('Layout has been reset to default configuration.');
        }
    },

    initMonaco: function() {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            window.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: '',
                language: 'html',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false }
            });

            // Bi-directional sync
            window.monacoEditor.onDidChangeModelContent(() => {
                if (App.isUpdatingCode) return;
                App.syncCodeToCanvas();
            });
        });
    },

    showSyncFeedback: function() {
        let feedback = document.getElementById('sync-feedback');
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.id = 'sync-feedback';
            feedback.style.position = 'fixed';
            feedback.style.bottom = '20px';
            feedback.style.right = '20px';
            feedback.style.background = '#007acc';
            feedback.style.color = 'white';
            feedback.style.padding = '8px 12px';
            feedback.style.borderRadius = '4px';
            feedback.style.fontSize = '12px';
            feedback.style.opacity = '0';
            feedback.style.transition = 'opacity 0.3s';
            feedback.style.zIndex = '10000';
            feedback.style.pointerEvents = 'none';
            feedback.innerText = 'Synced';
            document.body.appendChild(feedback);
        }
        
        feedback.style.opacity = '1';
        clearTimeout(this.feedbackTimeout);
        this.feedbackTimeout = setTimeout(() => {
            feedback.style.opacity = '0';
        }, 1000);
    },

    switchSidebar: function(tab) {
        // Handle 'components' legacy call
        if (tab === 'components') tab = 'html';

        // Toggle active button
        const buttons = document.querySelectorAll('.sidebar-tabs button');
        buttons.forEach(b => {
             if (b.dataset.tab === tab) b.classList.add('active');
             else b.classList.remove('active');
        });
        
        // Hide all content sections
        const contents = ['html', 'css', 'js', 'assets'];
        contents.forEach(t => {
            const el = document.getElementById('sidebar-content-' + t);
            if (el) el.style.display = 'none';
        });

        // Show active content
        const activeEl = document.getElementById('sidebar-content-' + tab);
        if (activeEl) {
            activeEl.style.display = 'flex';
        }
        
        if (tab === 'assets') this.loadAssets();
    },

    loadAssets: async function() {
        const list = document.getElementById('asset-list');
        list.innerHTML = '<div style="color:#888; text-align:center; grid-column:span 2;">Loading...</div>';
        
        try {
            const res = await fetch('/api/assets');
            if (!res.ok) throw new Error('Failed to fetch assets');
            
            const files = await res.json();
            
            list.innerHTML = '';
            if (files.length === 0) {
                list.innerHTML = '<div style="color:#888; text-align:center; grid-column:span 2;">No assets found</div>';
                return;
            }
            
            files.forEach(f => {
                const item = document.createElement('div');
                item.className = 'asset-item';
                item.style.border = '1px solid #3e3e42';
                item.style.borderRadius = '4px';
                item.style.padding = '5px';
                item.style.cursor = 'pointer';
                item.style.background = '#252526';
                item.innerHTML = `
                    <div style="height:60px; background:url('${f.url}') center/contain no-repeat; margin-bottom:5px;"></div>
                    <div style="font-size:10px; color:#ccc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</div>
                `;
                item.onclick = () => {
                    // If an image is selected, update it
                    const selected = Builder.selectedElement;
                    if (selected && selected.tagName === 'IMG') {
                        selected.src = f.url;
                        App.saveState();
                        App.updatePropertyInspector(selected);
                    } else {
                        // Or copy URL to clipboard
                        navigator.clipboard.writeText(f.url);
                        alert('Asset URL copied to clipboard!');
                    }
                };
                list.appendChild(item);
            });
            
        } catch (err) {
            console.error('Asset load error:', err);
            list.innerHTML = `<div style="color:red; text-align:center; grid-column:span 2;">Error: ${err.message}</div>`;
        }
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
        // Sidebar Tabs
        document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (target && target.dataset.tab) {
                    this.switchSidebar(target.dataset.tab);
                }
            });
        });

        // Category Toggles
        document.querySelectorAll('.category-title').forEach(title => {
            title.addEventListener('click', (e) => {
                this.toggleCategory(e.currentTarget);
            });
        });

        // Toolbar
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        document.getElementById('btn-save').addEventListener('click', () => this.saveProject());
        document.getElementById('btn-export').addEventListener('click', () => this.exportProject());
        
        // Code Editor Live Sync
        document.getElementById('code-editor').addEventListener('input', () => this.syncCodeToCanvas());

        // Asset Upload
        const uploadInput = document.getElementById('asset-upload');
        if (uploadInput) {
            uploadInput.addEventListener('change', async (e) => {
                if (e.target.files.length > 0) {
                    const formData = new FormData();
                    formData.append('file', e.target.files[0]);
                    
                    try {
                        const res = await fetch('/api/assets', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await res.json();
                        if (data.success) {
                            App.loadAssets(); // Reload list
                            // Optional: Show success feedback
                        } else {
                            alert('Upload failed: ' + (data.error || 'Unknown error'));
                        }
                    } catch (err) {
                        console.error('Upload error:', err);
                        alert('Upload error: ' + err.message);
                    } finally {
                        e.target.value = ''; // Reset input to allow re-uploading same file
                    }
                }
            });
        }

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            // Check if user is typing in an input/textarea (except our main editor if it wasn't Monaco)
            if (e.target.tagName === 'INPUT' || (e.target.tagName === 'TEXTAREA' && e.target.id !== 'code-editor')) {
                return;
            }
            
            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                this.redo();
            }
            // Save: Ctrl+S
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveProject();
            }
            // Delete: Del or Backspace (only if element selected and not editing text)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                 // Make sure we aren't in code editor
                 if (document.activeElement === document.body || document.activeElement.classList.contains('preview-canvas')) {
                     if (Builder.selectedElement) {
                         e.preventDefault();
                         Builder.selectedElement.remove();
                         Builder.deselectElement();
                         this.saveState();
                     }
                 }
            }
        });

        // View modes
        document.getElementById('btn-desktop').addEventListener('click', () => this.setViewMode('desktop'));
        document.getElementById('btn-tablet').addEventListener('click', () => this.setViewMode('tablet'));
        document.getElementById('btn-mobile').addEventListener('click', () => this.setViewMode('mobile'));
        document.getElementById('btn-reset-layout').addEventListener('click', () => this.resetLayout());

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

        const createInput = (label, value, onChange, type='text', options=[]) => {
            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = '8px';
            
            const lbl = document.createElement('label');
            lbl.className = 'prop-label';
            lbl.innerText = label;
            
            let inp;
            if (type === 'select') {
                inp = document.createElement('select');
                inp.className = 'prop-input';
                options.forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt;
                    o.innerText = opt;
                    if (opt === value) o.selected = true;
                    inp.appendChild(o);
                });
            } else if (type === 'color') {
                // Color input wrapper
                const colorWrap = document.createElement('div');
                colorWrap.style.display = 'flex';
                
                inp = document.createElement('input');
                inp.className = 'prop-input';
                inp.type = 'text';
                inp.value = value || '';
                inp.style.flex = '1';
                
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.value = value && value.startsWith('#') ? value : '#000000';
                picker.style.width = '30px';
                picker.style.height = '30px';
                picker.style.border = 'none';
                picker.style.padding = '0';
                picker.style.marginLeft = '5px';
                picker.style.cursor = 'pointer';
                
                picker.oninput = (e) => {
                    inp.value = e.target.value;
                    inp.dispatchEvent(new Event('input'));
                };
                
                colorWrap.appendChild(inp);
                colorWrap.appendChild(picker);
                
                wrapper.appendChild(lbl);
                wrapper.appendChild(colorWrap);
                
                const update = (e) => {
                    onChange(e.target.value);
                    this.updateCode();
                };
                inp.onchange = (e) => { update(e); this.saveState(); };
                inp.oninput = update;
                
                return wrapper;

            } else {
                inp = document.createElement('input');
                inp.className = 'prop-input';
                inp.type = type;
                inp.value = value || '';
            }
            
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
            createInput('Display', s.display, (v) => s.display = v, 'select', ['block', 'inline-block', 'flex', 'grid', 'none']),
        ]);

        // Flexbox controls (only if display is flex)
        if (s.display === 'flex') {
            createGroup('Flexbox', [
                createInput('Direction', s.flexDirection, (v) => s.flexDirection = v, 'select', ['row', 'column', 'row-reverse', 'column-reverse']),
                createInput('Justify', s.justifyContent, (v) => s.justifyContent = v, 'select', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around']),
                createInput('Align', s.alignItems, (v) => s.alignItems = v, 'select', ['stretch', 'flex-start', 'center', 'flex-end', 'baseline']),
                createInput('Gap', s.gap, (v) => s.gap = v)
            ]);
        }

        createGroup('Typography', [
            createInput('Color', s.color, (v) => s.color = v, 'color'),
            createInput('Font Size', s.fontSize, (v) => s.fontSize = v),
            createInput('Font Weight', s.fontWeight, (v) => s.fontWeight = v, 'select', ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
            createInput('Text Align', s.textAlign, (v) => s.textAlign = v, 'select', ['left', 'center', 'right', 'justify'])
        ]);

        createGroup('Appearance', [
            createInput('Background', s.backgroundColor, (v) => s.backgroundColor = v, 'color'),
            createInput('Border', s.border, (v) => s.border = v),
            createInput('Border Radius', s.borderRadius, (v) => s.borderRadius = v),
            createInput('Box Shadow', s.boxShadow, (v) => s.boxShadow = v)
        ]);
    },

    updateCode: function() {
        const activeTab = document.querySelector('.code-tabs button.active').dataset.lang;
        this.updateCodeView(activeTab);
    },

    syncCodeToCanvas: function() {
        // Use Monaco if available
        let code;
        if (window.monacoEditor) {
            code = window.monacoEditor.getValue();
        } else {
            code = document.getElementById('code-editor').value;
        }

        const activeTab = document.querySelector('.code-tabs button.active').dataset.lang;
        
        if (activeTab === 'html') {
            // Extract body content if wrapped in <html><body>...</body></html>
            let bodyContent = code;
            if (code.includes('<body')) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(code, 'text/html');
                bodyContent = doc.body.innerHTML;
            }
            
            Builder.loadHTML(bodyContent);
            
            // Debounce save
            this.saveStateDebounced();
        }
    },

    updateCodeView: function(lang) {
        if (!window.monacoEditor) return;
        
        const model = window.monacoEditor.getModel();
        monaco.editor.setModelLanguage(model, lang === 'js' ? 'javascript' : lang);

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
            
            // Set flag to prevent loop
            this.isUpdatingCode = true;
            try {
                const formatted = this.formatHTML(fullHtml);
                const currentVal = window.monacoEditor.getValue();
                
                // Only update if changed to avoid cursor jumping if possible (though setValue resets cursor usually)
                if (formatted !== currentVal) {
                    window.monacoEditor.setValue(formatted);
                    this.showSyncFeedback();
                }
            } finally {
                this.isUpdatingCode = false;
            }

        } else if (lang === 'css') {
            window.monacoEditor.setValue("/* Styles are currently inline in HTML. \n   Export to extract to CSS. */");
        } else if (lang === 'js') {
            window.monacoEditor.setValue("// Custom JavaScript");
        }
    },

    formatHTML: function(html) {
        let formatted = '';
        let pad = 0;
        
        // Fix: Strip leading/trailing brackets if present to avoid duplication
        // The split(/>\s*</) method assumes we are splitting 'between' tags,
        // so it re-adds brackets to everything. 
        // We need to ensure the first and last tags don't have their outer brackets 
        // before splitting, otherwise they get double brackets.
        html = html.trim();
        if (html.startsWith('<')) html = html.substring(1);
        if (html.endsWith('>')) html = html.substring(0, html.length - 1);
        
        html.split(/>\s*</).forEach(function(node) {
            if (node.match( /^\/\w/ )) pad -= 1;
            formatted += new Array(pad + 1).join('  ') + '<' + node + '>\r\n';
            if (node.match( /^<?\w[^>]*[^\/]$/ ) && !node.startsWith('input') && !node.startsWith('img') && !node.startsWith('br') && !node.startsWith('!DOCTYPE')) pad += 1;
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
