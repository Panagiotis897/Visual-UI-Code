class BezierEditor {
    constructor(canvasId, onChange) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.onChange = onChange;

        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.padding = 20;

        // P1 and P2 coordinates (normalized 0-1)
        this.p1 = { x: 0.25, y: 0.1 };
        this.p2 = { x: 0.25, y: 1.0 };

        this.draggedPoint = null;

        this.setupEvents();
        this.draw();
    }

    setupEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            const pos = this.getMousePos(e);
            if (this.hitTest(pos, this.p1)) this.draggedPoint = this.p1;
            else if (this.hitTest(pos, this.p2)) this.draggedPoint = this.p2;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.draggedPoint) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.padding) / (this.width - 2 * this.padding);
            const y = 1 - (e.clientY - rect.top - this.padding) / (this.height - 2 * this.padding);

            this.draggedPoint.x = Math.max(0, Math.min(1, x));
            this.draggedPoint.y = y; // y can be outside 0-1 for bouncy effects

            this.draw();
            if (this.onChange) this.onChange(this.p1.x, this.p1.y, this.p2.x, this.p2.y);
        });

        window.addEventListener('mouseup', () => {
            this.draggedPoint = null;
        });
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.padding) / (this.width - 2 * this.padding),
            y: 1 - (e.clientY - rect.top - this.padding) / (this.height - 2 * this.padding)
        };
    }

    hitTest(pos, point) {
        const dx = pos.x - point.x;
        const dy = pos.y - point.y;
        return (dx*dx + dy*dy) < 0.01; // tolerance
    }

    setPoints(x1, y1, x2, y2) {
        this.p1 = { x: x1, y: y1 };
        this.p2 = { x: x2, y: y2 };
        this.draw();
    }

    draw() {
        const w = this.width - 2 * this.padding;
        const h = this.height - 2 * this.padding;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, this.width, this.height);

        // Transform to convenient coords
        ctx.save();
        ctx.translate(this.padding, this.height - this.padding);
        ctx.scale(w, -h);

        // Grid
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1/w;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(1, 1);
        ctx.stroke();

        // Curve
        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 3/w;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(this.p1.x, this.p1.y, this.p2.x, this.p2.y, 1, 1);
        ctx.stroke();

        // Handles
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1/w;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(this.p1.x, this.p1.y);
        ctx.moveTo(1, 1); ctx.lineTo(this.p2.x, this.p2.y);
        ctx.stroke();

        // Points
        this.drawPoint(this.p1, '#ff00ff');
        this.drawPoint(this.p2, '#00ffff');

        ctx.restore();
    }

    drawPoint(p, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 0.04, 0, Math.PI * 2); // logical radius
        this.ctx.fill();
    }
}

const App = {
    isTouchMode: false,
    history: [],
    historyIndex: -1,
    maxHistory: 20,
    saveTimeout: null,
    isUpdatingCode: false,
    expandedPaths: new Set(), // Track expanded folders
    currentFilePath: null,
    activeMediaQuery: '', // Current media query context for CSS edits

    init: function() {
        this.projectIndex = { classes: [], ids: [] };
        this.styleTarget = 'inline';
        this.styleTargetName = '';
        this.lastSelectedElement = null;
        // Load expanded paths
        try {
            const saved = JSON.parse(localStorage.getItem('vuc_expanded_paths'));
            if (Array.isArray(saved)) this.expandedPaths = new Set(saved);
        } catch (e) {
            console.error('Failed to load expanded paths', e);
        }

        // Load saved project path
        this.currentProjectPath = localStorage.getItem('vuc_project_path');

        // Load Touch Mode
        this.isTouchMode = localStorage.getItem('vuc_touch_mode') === 'true';
        if (this.isTouchMode) {
            document.body.classList.add('touch-mode');
        }

        this.renderRecentProjects();
        this.initSavedBlocks();
        this.loadProjectColors();
        Builder.init();
        this.setupEventListeners();
        this.setupTerminal();
        this.loadProject();
        this.initMonaco();
        this.setupCodeEditorDragAndDrop(); // Init DnD for Editor
        this.setupResizers();
        this.loadLayout();
        this.initColorStudio();
        this.initStructureFileSelect();
        this.setupGlobalShortcuts();
        this.initAnimationStudio();

        // Load File Tree if project path exists
        if (this.currentProjectPath) {
            this.refreshFileTree();
            const projectName = this.currentProjectPath.split(/[/\\]/).pop();
            const titleEl = document.getElementById('explorer-project-name');
            if (titleEl) titleEl.innerHTML = `<i class="fas fa-chevron-down"></i> &nbsp; ${projectName.toUpperCase()}`;
        }

        // Initial save
        this.saveState();
        this.updateCode();
        this.renderStructureTree(); // Init Tree
    },

    initStructureFileSelect: function() {
        const select = document.getElementById('structure-file-select');
        if (select) {
            select.addEventListener('change', (e) => {
                const path = e.target.value;
                if (path) {
                    this.openFile(path);
                }
            });
        }
    },

    setupGlobalShortcuts: function() {
        document.addEventListener('keydown', (e) => {
            // Export Shortcut (Ctrl+E)
            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                this.exportSelectedElements();
            }
        });
    },

    // --- Navigation & UI Control ---
    goHome: function() {
        document.getElementById('project-hub').style.display = 'flex';
    },

    showGitHubImport: function() {
        this.showModal('GitHub Import', 'Enter the repository URL (and destination folder if needed)', 'https://github.com/user/repo', (val) => {
            this.handleGitHubImport(val);
        });
    },

    handleGitHubImport: function(repoUrl) {
        if (!repoUrl) return;

        this.logConsole(`Cloning repository: ${repoUrl}...`, 'info');

        fetch('/api/github_import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_url: repoUrl })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                if (data.path) {
                    // Path exists, still try to index it
                    this.logConsole('Repository already exists, indexing existing folder...', 'warning');
                    this.openProjectPath(data.path);
                    return;
                }
                throw new Error(data.error);
            }
            this.logConsole(`Successfully cloned to ${data.path}`, 'success');
            this.openProjectPath(data.path);
        })
        .catch(err => {
            this.logConsole(`Import failed: ${err.message}`, 'error');
            alert(`Import failed: ${err.message}`);
        });
    },

    openProjectPath: function(path) {
        this.currentProjectPath = path;
        localStorage.setItem('vuc_project_path', path);
        this.isScratchpad = false;

        document.getElementById('project-hub').style.display = 'none';
        this.refreshFileTree();
        this.indexProject(path);
        this.saveRecentProject(path.split('/').pop(), path);
    },

    indexProject: function(path) {
        this.logConsole('Indexing project selectors...', 'info');
        fetch('/api/index_project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            this.projectIndex = data;
            this.logConsole(`Indexed ${data.classes.length} classes and ${data.ids.length} IDs`, 'success');
        })
        .catch(err => {
            this.logConsole(`Indexing failed: ${err.message}`, 'error');
        });
    },

    openProject: function() {
        this.showProjectPicker();
    },

    showProjectPicker: function(path = null) {
        if (!path) path = this.currentProjectPath || '~/projects';

        const container = document.createElement('div');
        container.style.height = '400px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';

        // Header (Current Path + Up Button)
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.gap = '10px';
        header.style.marginBottom = '10px';
        header.style.alignItems = 'center';

        const upBtn = document.createElement('button');
        upBtn.innerHTML = '<i class="fas fa-level-up-alt"></i>';
        upBtn.className = 'btn';
        upBtn.onclick = () => {
            // Simple string manipulation for parent
            let parent = path.replace(/\\/g, '/').split('/');
            parent.pop();
            const parentPath = parent.join('/') || '/';
            this.showProjectPicker(parentPath);
        };

        const newFolderBtn = document.createElement('button');
        newFolderBtn.innerHTML = '<i class="fas fa-folder-plus"></i>';
        newFolderBtn.className = 'btn';
        newFolderBtn.title = 'Create New Folder';
        newFolderBtn.onclick = () => {
             const name = prompt('New Folder Name:');
             if (name) {
                 fetch('/api/create_folder', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ path: path + '/' + name })
                 })
                 .then(res => res.json())
                 .then(data => {
                     if (data.error) alert(data.error);
                     else this.showProjectPicker(path); // Refresh
                 });
             }
        };

        const pathDisplay = document.createElement('input');
        pathDisplay.type = 'text';
        pathDisplay.value = path;
        pathDisplay.className = 'prop-input';
        pathDisplay.style.flex = '1';
        pathDisplay.onchange = (e) => this.showProjectPicker(e.target.value);

        header.appendChild(upBtn);
        header.appendChild(newFolderBtn);
        header.appendChild(pathDisplay);
        container.appendChild(header);

        // File List
        const listContainer = document.createElement('div');
        listContainer.style.flex = '1';
        listContainer.style.overflowY = 'auto';
        listContainer.style.border = '1px solid #333';
        listContainer.style.borderRadius = '4px';
        listContainer.style.padding = '5px';
        listContainer.style.backgroundColor = '#1e1e1e';
        listContainer.innerHTML = '<div style="padding:10px; color:#888;">Loading...</div>';
        container.appendChild(listContainer);

        // Fetch files
        fetch('/api/list_files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                listContainer.innerHTML = `<div style="color:red; padding:10px;">Error: ${data.error}</div>`;
                return;
            }

            // Update path if resolved differently
            if (data.path) {
                path = data.path;
                pathDisplay.value = path;
            }

            listContainer.innerHTML = '';

            // Directories only for picker (usually) or all files?
            // Let's show dirs prominently
            const dirs = data.items.filter(i => i.type === 'dir');

            if (dirs.length === 0) {
                listContainer.innerHTML = '<div style="padding:10px; color:#666;">No subdirectories found.</div>';
            }

            dirs.forEach(dir => {
                const item = document.createElement('div');
                item.style.padding = '5px 10px';
                item.style.cursor = 'pointer';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '10px';
                item.innerHTML = `<i class="fas fa-folder" style="color:#dcb67a;"></i> ${dir.name}`;
                item.onmouseover = () => item.style.backgroundColor = '#2a2d2e';
                item.onmouseout = () => item.style.backgroundColor = 'transparent';
                item.onclick = () => this.showProjectPicker(dir.path);
                listContainer.appendChild(item);
            });
        })
        .catch(err => {
            listContainer.innerHTML = `<div style="color:red; padding:10px;">Connection Error</div>`;
        });

        // Footer Buttons
        const footer = document.createElement('div');
        footer.style.marginTop = '15px';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '10px';

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'Cancel';
        cancelBtn.className = 'btn';
        cancelBtn.onclick = () => this.closeModal();

        const selectBtn = document.createElement('button');
        selectBtn.innerText = 'Open This Project';
        selectBtn.className = 'btn primary';
        selectBtn.onclick = () => {
            this.currentProjectPath = path;
            localStorage.setItem('vuc_project_path', path);

            // Update Explorer Title
            const projectName = path.split(/[/\\]/).pop();
            const titleEl = document.getElementById('explorer-project-name');
            if (titleEl) titleEl.innerHTML = `<i class="fas fa-chevron-down"></i> &nbsp; ${projectName.toUpperCase()}`;

            document.getElementById('project-hub').style.display = 'none';
            this.closeModal();
            this.refreshFileTree();
            this.logConsole(`Project path set to: ${path}`, 'success');

            this.addToRecentProjects(path);

            // Try to load index.html
            fetch('/api/read_file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path + '/index.html' }) // Try standard location
            })
            .then(res => res.json())
            .then(data => {
                if (!data.error) {
                    // It's an HTML file
                    Builder.loadHTML(data.content);
                    this.logConsole('Loaded index.html', 'success');
                } else {
                    // Maybe try main.js if it's a JS project?
                    this.logConsole('No index.html found in root. Check file tree.', 'info');
                }
            });
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(selectBtn);
        container.appendChild(footer);

        this.showModal({
            title: 'Open Project Folder',
            message: '',
            onOk: null // Handled by custom buttons
        });

        // Inject content
        const msgEl = document.getElementById('generic-modal-message');
        if (msgEl) {
            msgEl.innerHTML = '';
            msgEl.appendChild(container);
        }
    },

    openInVSCode: function() {
        const path = this.currentProjectPath || '.';
        fetch('/api/run_command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: `code "${path}"` })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                this.showModal({ title: 'Error', message: 'Failed to open VS Code: ' + data.error });
            } else {
                // Success - silent or toast? Let's assume silent is fine or console log
                console.log('Opened VS Code', data);
            }
        })
        .catch(err => {
            this.showModal({ title: 'Error', message: 'Connection error: ' + err.message });
        });
    },

    showHelp: function() {
        this.showModal({
            title: 'Help & Keyboard Shortcuts',
            message: '', // Custom content via innerHTML if generic modal supported it, but it uses innerText for message.
                         // We might need to extend showModal or just use a long string.
                         // Let's check showModal implementation.
            // showModal uses innerText for message (line 38).
            // I should update showModal to support HTML or just use newlines.
        });
        // Actually, let's update showModal to support HTML content or create a specific modal for help.
        // For now, I'll use a formatted string.
        const msg =
`Navigation:
- Home: Ctrl + H (or Home button)
- New Project: Home Screen > Select Type
- Toggle Timeline: Ctrl + T

Editing:
- Undo: Ctrl + Z
- Redo: Ctrl + Y or Ctrl + Shift + Z
- Save: Ctrl + S
- Delete Element: Delete / Backspace

Views:
- Desktop/Tablet/Mobile: Toolbar Buttons
- Reset Layout: Toolbar Button`;

        this.showModal({
            title: 'Keyboard Shortcuts',
            message: msg
        });
    },

    toggleTimelinePanel: function() {
        const bottomPanel = document.getElementById('bottom-panel');
        const timelineContent = document.getElementById('panel-content-timeline');

        // Ensure panel is visible (height > 35px is a rough check for minimized state,
        // but we should check if it's minimized by class or style)
        // Based on toggleBottomPanel: minimized sets height to 35px.
        const isMinimized = bottomPanel.clientHeight <= 35;

        if (isMinimized) {
            this.toggleBottomPanel(); // Restore
            this.switchBottomPanel('timeline');
        } else {
            // If already open, check if timeline is active
            if (timelineContent.style.display === 'flex' && timelineContent.classList.contains('active')) {
                this.toggleBottomPanel(); // Minimize
            } else {
                this.switchBottomPanel('timeline');
            }
        }
    },

    toggleCodeView: function() {
        const codePanel = document.getElementById('code-editor-panel');
        const resizerCode = document.getElementById('resizer-code');
        const previewPanel = document.getElementById('preview-panel');

        if (!codePanel || !previewPanel) return;

        if (codePanel.style.display === 'none') {
            // Show
            codePanel.style.display = 'flex';
            if (resizerCode) resizerCode.style.display = 'block';

            if (codePanel.dataset.prevFlex) {
                codePanel.style.flex = codePanel.dataset.prevFlex;
                previewPanel.style.flex = previewPanel.dataset.prevFlex;
            } else {
                codePanel.style.flex = '0 0 40%';
                previewPanel.style.flex = '1';
            }
        } else {
            // Hide
            codePanel.dataset.prevFlex = codePanel.style.flex;
            previewPanel.dataset.prevFlex = previewPanel.style.flex;

            codePanel.style.display = 'none';
            if (resizerCode) resizerCode.style.display = 'none';
            previewPanel.style.flex = '1';
        }
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    },

    toggleTerminalView: function() {
        const bottomPanel = document.getElementById('bottom-panel');
        const resizerTerminal = document.getElementById('resizer-terminal');
        const editorContent = document.getElementById('editor-content-wrapper');

        if (!bottomPanel || !editorContent) return;

        if (bottomPanel.style.display === 'none') {
            // Show
            bottomPanel.style.display = 'flex';
            if (resizerTerminal) resizerTerminal.style.display = 'block';

            if (editorContent.dataset.prevHeight) {
                editorContent.style.height = editorContent.dataset.prevHeight;
                bottomPanel.style.height = bottomPanel.dataset.prevHeight;
            } else {
                editorContent.style.height = 'calc(100% - 200px)';
                bottomPanel.style.height = '200px';
            }
        } else {
            // Hide
            editorContent.dataset.prevHeight = editorContent.style.height;
            bottomPanel.dataset.prevHeight = bottomPanel.style.height;

            bottomPanel.style.display = 'none';
            if (resizerTerminal) resizerTerminal.style.display = 'none';
            editorContent.style.height = '100%';
        }
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    },

    // --- Generic Modal Logic ---
    modalCallback: null,

    showModal: function(options) {
        const { title, message, showInput, defaultValue, onOk } = options;

        const titleEl = document.getElementById('generic-modal-title');
        const msgEl = document.getElementById('generic-modal-message');
        const inputWrapper = document.getElementById('generic-modal-input-wrapper');
        const input = document.getElementById('generic-modal-input');
        const modal = document.getElementById('generic-modal');

        if (titleEl) titleEl.innerText = title || 'Message';
        if (msgEl) msgEl.innerText = message || '';

        if (showInput && inputWrapper && input) {
            inputWrapper.style.display = 'block';
            input.value = defaultValue || '';
            setTimeout(() => input.focus(), 100);
        } else if (inputWrapper) {
            inputWrapper.style.display = 'none';
        }

        this.modalCallback = onOk;
        if (modal) modal.style.display = 'flex';
    },

    closeModal: function() {
        const modal = document.getElementById('generic-modal');
        if (modal) modal.style.display = 'none';
        this.modalCallback = null;
    },

    handleModalOk: function() {
        const input = document.getElementById('generic-modal-input');
        const value = input ? input.value : null;

        if (this.modalCallback) {
            this.modalCallback(value);
        }
        this.closeModal();
    },

    // --- Project Hub Logic ---
        startScratchpad: function() {
        this.currentProjectPath = null;
        this.currentFilePath = null;
        localStorage.removeItem('vuc_project_path');
        document.getElementById('project-hub').style.display = 'none';
        Builder.loadHTML('<div style="padding:40px; text-align:center;"><h1>Scratchpad Mode</h1><p>Work is saved to browser storage only.</p></div>');
        this.saveState();
        this.updateCode();
        this.renderStructureTree();
        this.logConsole('Running in Scratchpad Mode (No-File Mode)', 'info');
    },

    startNewProject: function(type = 'static') {
        // Default to static (HTML) as requested

        // Create form content
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '15px';
        container.style.marginTop = '10px';

        // Project Name
        const nameGroup = document.createElement('div');
        const nameLabel = document.createElement('label');
        nameLabel.innerText = 'Project Name:';
        nameLabel.style.display = 'block';
        nameLabel.style.marginBottom = '5px';
        nameLabel.style.color = '#ccc';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'prop-input';
        nameInput.placeholder = 'MyWebsite';
        nameGroup.appendChild(nameLabel);
        nameGroup.appendChild(nameInput);
        container.appendChild(nameGroup);

        // Save Path
        const pathGroup = document.createElement('div');
        const pathLabel = document.createElement('label');
        pathLabel.innerText = 'Save Location:';
        pathLabel.style.display = 'block';
        pathLabel.style.marginBottom = '5px';
        pathLabel.style.color = '#ccc';
        const pathInput = document.createElement('input');
        pathInput.type = 'text';
        pathInput.className = 'prop-input';
        pathInput.value = '~/projects';
        pathGroup.appendChild(pathLabel);
        pathGroup.appendChild(pathInput);
        container.appendChild(pathGroup);

        this.showModal({
            title: 'Create New Project',
            message: '',
            showInput: false,
            onOk: () => {
                const name = nameInput.value.trim();
                const path = pathInput.value.trim();

                if (!name) {
                    alert('Project name is required!');
                    return;
                }

                // Call API
                fetch('/api/create_project', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        path: path,
                        type: 'static', // Hardcoded
                        transpiler: null
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        alert('Error: ' + data.error);
                    } else {
                        // Success
                        document.getElementById('project-hub').style.display = 'none';
                        this.logConsole(`Created project "${name}" at ${data.path}`, 'success');

                        // Save Path
                        localStorage.setItem('vuc_project_path', data.path);
                        this.currentProjectPath = data.path;

                        // Load the new project content
                        Builder.canvas.innerHTML = '';

                        // Try to load index.html content immediately
                        fetch('/api/read_file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: data.path + '/index.html' })
                        })
                        .then(res => res.json())
                        .then(fileData => {
                            if (fileData.content) {
                                Builder.loadHTML(fileData.content);
                                this.logConsole('Loaded index.html', 'success');
                            } else {
                                // Fallback
                                Builder.canvas.innerHTML = `<div class="dropped-element" style="padding:40px; text-align:center;"><h1>${name}</h1><p>Start building your website!</p></div>`;
                            }
                            this.saveState();
                            this.updateCode();
                        })
                        .catch(err => {
                            console.error('Error loading new project file:', err);
                            // Fallback
                            Builder.canvas.innerHTML = `<div class="dropped-element" style="padding:40px; text-align:center;"><h1>${name}</h1><p>Start building your website!</p></div>`;
                            this.saveState();
                            this.updateCode();
                        });

                        // Update Explorer Title
                        const projectName = data.path.split(/[/\\]/).pop();
                        const titleEl = document.getElementById('explorer-project-name');
                        if (titleEl) titleEl.innerHTML = `<i class="fas fa-chevron-down"></i> &nbsp; ${projectName.toUpperCase()}`;

                        // Refresh File Tree
                        this.refreshFileTree();

                        this.addToRecentProjects(data.path);

                        this.saveState();
                        this.updateCode();
                    }
                })
                .catch(err => {
                    alert('Connection error: ' + err.message);
                });
            }
        });

        // Inject custom content
        const msgEl = document.getElementById('generic-modal-message');
        if (msgEl) {
            msgEl.innerHTML = '';
            msgEl.appendChild(container);
            setTimeout(() => nameInput.focus(), 100);
        }
    },

    openRecent: function(name) {
        // Deprecated but kept for compatibility if needed
        console.log('Loading project:', name);
    },

    renderRecentProjects: function() {
        const container = document.getElementById('recent-projects-list');
        const section = document.getElementById('hub-recent-section');
        if (!container || !section) return;

        let recent = [];
        try {
            recent = JSON.parse(localStorage.getItem('vuc_recent_projects') || '[]');
        } catch(e) { recent = []; }

        if (recent.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        container.innerHTML = '';

        recent.forEach(p => {
            const item = document.createElement('div');
            item.className = 'recent-item';
            item.onclick = () => {
                 this.currentProjectPath = p.path;
                 localStorage.setItem('vuc_project_path', p.path);

                 // Update Explorer Title
                 const projectName = p.path.split(/[/\\]/).pop();
                 const titleEl = document.getElementById('explorer-project-name');
                 if (titleEl) titleEl.innerHTML = `<i class="fas fa-chevron-down"></i> &nbsp; ${projectName.toUpperCase()}`;

                 document.getElementById('project-hub').style.display = 'none';
                 this.refreshFileTree();

                 // Move to top of recent
                 this.addToRecentProjects(p.path);
                 // No need to re-render immediately as hub is closed, but good for next time
            };

            item.innerHTML = `
                <div class="icon"><i class="fas fa-folder"></i></div>
                <div class="details">
                    <span class="name">${p.name}</span>
                    <span class="path">${p.path}</span>
                </div>
                <div class="date">${p.date}</div>
            `;
            container.appendChild(item);
        });
    },

    addToRecentProjects: function(path) {
        if (!path) return;
        let recent = [];
        try {
            recent = JSON.parse(localStorage.getItem('vuc_recent_projects') || '[]');
        } catch(e) { recent = []; }

        // Remove if exists
        recent = recent.filter(p => p.path !== path);

        // Add to top
        const name = path.split(/[/\\]/).pop();
        recent.unshift({
            name: name,
            path: path,
            date: new Date().toLocaleDateString()
        });

        // Limit
        if (recent.length > 10) recent.pop();

        localStorage.setItem('vuc_recent_projects', JSON.stringify(recent));
        this.renderRecentProjects();
    },

    clearRecentProjects: function() {
        if(confirm('Clear recent projects list?')) {
            localStorage.removeItem('vuc_recent_projects');
            this.renderRecentProjects();
        }
    },

    initProjectHub: function() {
        // Simplified init
    },

    // --- Color Studio Logic ---
    toggleProjectFiles: function() {
        const container = document.getElementById('project-files-container');
        const icon = document.getElementById('project-files-toggle-icon');
        if (container.style.display === 'none') {
            container.style.display = 'flex';
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-down');
        } else {
            container.style.display = 'none';
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-right');
        }
    },

    toggleColorStudio: function() {
        document.getElementById('color-studio-modal').style.display = 'flex';
        this.updateColorStudio();
    },

    closeColorStudio: function() {
        document.getElementById('color-studio-modal').style.display = 'none';
    },

    initColorStudio: function() {
        const hex = document.getElementById('cs-hex');
        const r = document.getElementById('cs-r');
        const g = document.getElementById('cs-g');
        const b = document.getElementById('cs-b');
        const h = document.getElementById('cs-h');
        const s = document.getElementById('cs-s');
        const l = document.getElementById('cs-l');

        // Initial Sync
        const syncAll = (color) => {
            const rgb = this.hexToRgb(color);
            if (rgb) {
                r.value = rgb.r; g.value = rgb.g; b.value = rgb.b;
                const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
                if (hsl) {
                    h.value = Math.round(hsl.h * 360);
                    s.value = Math.round(hsl.s * 100);
                    l.value = Math.round(hsl.l * 100);
                }
                this.updateColorStudio(color);
            }
        };

        // Initialize
        if (hex) syncAll(hex.value);

        const updateFromHex = () => {
            let val = hex.value;
            if (val.startsWith('#') && val.length === 7) {
                syncAll(val);
            }
        };

        const updateFromRgb = () => {
            const val = this.rgbToHex(r.value, g.value, b.value);
            hex.value = val;
            // Update HSL
            const hsl = this.rgbToHsl(r.value, g.value, b.value);
            if (hsl) {
                h.value = Math.round(hsl.h * 360);
                s.value = Math.round(hsl.s * 100);
                l.value = Math.round(hsl.l * 100);
            }
            this.updateColorStudio(val);
        };

        const updateFromHsl = () => {
            const rgb = this.hslToRgb(h.value / 360, s.value / 100, l.value / 100);
            r.value = Math.round(rgb.r);
            g.value = Math.round(rgb.g);
            b.value = Math.round(rgb.b);
            const val = this.rgbToHex(rgb.r, rgb.g, rgb.b);
            hex.value = val;
            this.updateColorStudio(val);
        };

        if (hex) hex.addEventListener('input', updateFromHex);
        if (r) r.addEventListener('input', updateFromRgb);
        if (g) g.addEventListener('input', updateFromRgb);
        if (b) b.addEventListener('input', updateFromRgb);
        if (h) h.addEventListener('input', updateFromHsl);
        if (s) s.addEventListener('input', updateFromHsl);
        if (l) l.addEventListener('input', updateFromHsl);
    },

    updateColorStudio: function(color) {
        if (!color) color = document.getElementById('cs-hex').value;

        // Update preview
        const preview = document.getElementById('cs-preview');
        if (preview) preview.style.backgroundColor = color;

        const contrastBox = document.getElementById('cs-contrast-box');
        if (contrastBox) contrastBox.style.backgroundColor = color;

        // Calculate contrast
        const rgb = this.hexToRgb(color);
        if (!rgb) return;

        // Calculate luminance
        // sRGB formula
        const getLum = (c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const L = 0.2126 * getLum(rgb.r) + 0.7152 * getLum(rgb.g) + 0.0722 * getLum(rgb.b);

        // Contrast with white (L=1.0)
        const ratio = (1.0 + 0.05) / (L + 0.05);

        const valEl = document.getElementById('cs-contrast-val');
        const badgeEl = document.getElementById('cs-contrast-badge');

        if (valEl) valEl.innerText = ratio.toFixed(2) + ':1';

        if (badgeEl) {
            if (ratio >= 4.5) {
                badgeEl.className = 'badge pass';
                badgeEl.innerText = 'AA Pass';
                badgeEl.style.backgroundColor = '#4caf50';
            } else if (ratio >= 3.0) {
                 badgeEl.className = 'badge pass';
                 badgeEl.style.backgroundColor = 'orange';
                 badgeEl.innerText = 'AA Large';
            } else {
                badgeEl.className = 'badge fail';
                badgeEl.innerText = 'Fail';
                badgeEl.style.backgroundColor = '#f44336';
            }
        }
    },

    saveColorFromStudio: function() {
        const color = document.getElementById('cs-hex').value;
        if (!this.projectColors.includes(color)) {
            this.projectColors.push(color);
            this.saveProjectColors();
        }
        this.closeColorStudio();
    },

    hexToRgb: function(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    rgbToHex: function(r, g, b) {
        return "#" + ((1 << 24) + (parseInt(r) << 16) + (parseInt(g) << 8) + parseInt(b)).toString(16).slice(1);
    },

    rgbToHsl: function(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    },

    hslToRgb: function(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    },
    // -------------------------

    toggleCategory: function(header) {
        const category = header.parentElement;
        category.classList.toggle('collapsed');
    },

    setupCodeEditorDragAndDrop: function() {
        // Wait for Monaco container
        setTimeout(() => {
            const editorEl = document.getElementById('monaco-editor');
            if (!editorEl) return;

            editorEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                editorEl.style.outline = '2px dashed #007acc';
            });

            editorEl.addEventListener('dragleave', () => {
                editorEl.style.outline = '';
            });

            editorEl.addEventListener('drop', (e) => {
                e.preventDefault();
                editorEl.style.outline = '';

                const type = e.dataTransfer.getData('text/plain');
                if (!type || !ComponentDefinitions[type]) return;

                // Generate Code
                const def = ComponentDefinitions[type];
                let code = `<${def.tag}`;

                // Add class
                if (def.attributes.class) code += ` class="${def.attributes.class}"`;

                // Add other attributes
                for (const [k, v] of Object.entries(def.attributes)) {
                    if (k !== 'class') code += ` ${k}="${v}"`;
                }

                // Add default styles (to match visual builder)
                let styleStr = '';
                for (const [k, v] of Object.entries(def.defaultStyles)) {
                    styleStr += `${k}: ${v}; `;
                }
                if (styleStr) code += ` style="${styleStr.trim()}"`;

                code += `>`;

                // Add content
                if (!def.isVoid) {
                    code += def.defaultContent || '';
                    code += `</${def.tag}>`;
                }

                // Insert into Monaco
                if (window.monacoEditor) {
                    // Get drop position
                    const target = window.monacoEditor.getTargetAtClientPoint(e.clientX, e.clientY);

                    if (target && target.position) {
                        const pos = target.position;
                        window.monacoEditor.executeEdits('dnd', [{
                            range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                            text: code,
                            forceMoveMarkers: true
                        }]);
                        window.monacoEditor.setPosition(pos);
                        window.monacoEditor.revealPosition(pos);
                    } else {
                        // Fallback to cursor
                        const selection = window.monacoEditor.getSelection();
                        const op = {
                            range: selection,
                            text: code,
                            forceMoveMarkers: true
                        };
                        window.monacoEditor.executeEdits('dnd', [op]);
                    }

                    // Trigger sync
                    App.syncCodeToCanvas();
                    App.logConsole(`Dropped ${def.name} into code`, 'success');
                }
            });
        }, 1000); // Delay to ensure Monaco is ready
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
        if (sidebar) {
            createResizer('resizer-sidebar', 'horizontal', (dx, dy, e) => {
                const newWidth = e.clientX;
                if (newWidth > 150 && newWidth < 500) {
                    sidebar.style.width = newWidth + 'px';
                }
            }, () => this.saveLayout());
        }

        // Code/Preview Resizer
        const codePanel = document.getElementById('code-editor-panel');
        const previewPanel = document.getElementById('preview-panel');
        const workspace = document.querySelector('.workspace');

        if (codePanel && previewPanel && workspace) {
            createResizer('resizer-code', 'horizontal', (dx, dy, e) => {
                const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 0;
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
        }

        // Terminal Resizer
        const editorContent = document.getElementById('editor-content-wrapper');
        const terminal = document.getElementById('bottom-panel');

        if (editorContent && terminal && codePanel) {
            createResizer('resizer-terminal', 'vertical', (dx, dy, e) => {
                const codePanelRect = codePanel.getBoundingClientRect();
                const panelTop = codePanelRect.top;
                const panelHeight = codePanelRect.height;

                let newEditorHeight = e.clientY - panelTop;

                // Constraints
                if (newEditorHeight < 50) newEditorHeight = 50;
                if (newEditorHeight > panelHeight - 35) newEditorHeight = panelHeight - 35; // Min height for bottom panel header

                const editorPercent = (newEditorHeight / panelHeight) * 100;

                editorContent.style.height = `${editorPercent}%`;
                terminal.style.height = `${100 - editorPercent}%`;
            }, () => this.saveLayout());
        }
    },

    // --- Bottom Panel Logic ---
    switchBottomPanel: function(tabName) {
        // Toggle buttons
        const buttons = document.querySelectorAll('.panel-tabs button');
        buttons.forEach(b => {
            if (b.dataset.tab === tabName) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        // Toggle content
        document.querySelectorAll('#bottom-panel .panel-content').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('active');
        });

        const activePanel = document.getElementById('panel-content-' + tabName);
        if (activePanel) {
            activePanel.style.display = 'flex';
            activePanel.classList.add('active');
        }

        if (tabName === 'boxmodel' && Builder.selectedElement) {
            this.renderBoxModel(Builder.selectedElement);
        }
    },

    toggleBottomPanel: function() {
        const panel = document.getElementById('bottom-panel');
        const icon = document.querySelector('.panel-actions i.fa-chevron-down, .panel-actions i.fa-chevron-up');

        if (panel.clientHeight > 35) {
            // Minimize
            panel.dataset.prevHeight = panel.style.height || '200px';
            panel.style.height = '35px';
            if (icon) { icon.className = 'fas fa-chevron-up'; icon.parentElement.title = 'Restore'; }
        } else {
            // Restore
            panel.style.height = panel.dataset.prevHeight || '200px';
            if (icon) { icon.className = 'fas fa-chevron-down'; icon.parentElement.title = 'Minimize'; }
        }
    },

    // --- Animation Studio Logic ---
    animations: {},
    currentAnim: null,
    bezierEditor: null,

    initAnimationStudio: function() {
        // Initialize Bezier Editor
        if (document.getElementById('bezier-canvas')) {
            this.bezierEditor = new BezierEditor('bezier-canvas', (x1, y1, x2, y2) => {
                this.updateEasingFromEditor(x1, y1, x2, y2);
            });
        }

        // Bind inputs
        const durationInput = document.getElementById('anim-duration');
        if (durationInput) {
            durationInput.addEventListener('input', (e) => {
                if (this.currentAnim) {
                    this.animations[this.currentAnim].duration = e.target.value;
                    this.generateAnimationCSS();
                }
            });
        }

        const iterInput = document.getElementById('anim-iter');
        if (iterInput) {
            iterInput.addEventListener('input', (e) => {
                if (this.currentAnim) {
                    this.animations[this.currentAnim].iter = e.target.value;
                    this.generateAnimationCSS();
                }
            });
        }

        const infiniteInput = document.getElementById('anim-infinite');
        if (infiniteInput) {
            infiniteInput.addEventListener('change', (e) => {
                if (this.currentAnim) {
                    const iterVal = document.getElementById('anim-iter').value;
                    this.animations[this.currentAnim].iter = e.target.checked ? 'inf' : iterVal;
                    document.getElementById('anim-iter').disabled = e.target.checked;
                    this.generateAnimationCSS();
                }
            });
        }
    },

    updateEasingFromEditor: function(x1, y1, x2, y2) {
        if (!this.currentAnim) return;
        const val = `cubic-bezier(${x1.toFixed(2)}, ${y1.toFixed(2)}, ${x2.toFixed(2)}, ${y2.toFixed(2)})`;
        this.animations[this.currentAnim].easing = val;

        document.getElementById('bezier-val-p1').innerText = `${x1.toFixed(2)}, ${y1.toFixed(2)}`;
        document.getElementById('bezier-val-p2').innerText = `${x2.toFixed(2)}, ${y2.toFixed(2)}`;

        document.getElementById('anim-easing-preset').value = 'custom';
        this.generateAnimationCSS();
    },

    setEasingPreset: function(preset) {
        if (!this.currentAnim) return;

        let x1=0.25, y1=0.1, x2=0.25, y2=1.0; // default ease

        switch(preset) {
            case 'linear': x1=0.0, y1=0.0, x2=1.0, y2=1.0; break;
            case 'ease': x1=0.25, y1=0.1, x2=0.25, y2=1.0; break;
            case 'ease-in': x1=0.42, y1=0.0, x2=1.0, y2=1.0; break;
            case 'ease-out': x1=0.0, y1=0.0, x2=0.58, y2=1.0; break;
            case 'ease-in-out': x1=0.42, y1=0.0, x2=0.58, y2=1.0; break;
        }

        if (preset !== 'custom' && this.bezierEditor) {
            this.bezierEditor.setPoints(x1, y1, x2, y2);
            // Manually update text without recursive loop if needed, but updateEasingFromEditor handles UI update
            this.updateEasingFromEditor(x1, y1, x2, y2);
            document.getElementById('anim-easing-preset').value = preset; // set it back as updateEasing sets to custom
        }
    },

    createAnimation: function() {
        this.showModal({
            title: 'New Animation',
            message: "Enter animation name (e.g., 'slide-in'):",
            showInput: true,
            onOk: (name) => {
                if (!name) return;
                if (this.animations[name]) {
                    App.showModal({ title: 'Error', message: 'Animation already exists!' });
                    return;
                }

                this.animations[name] = {
                    duration: 1,
                    iter: 1,
                    easing: 'cubic-bezier(0.25, 0.10, 0.25, 1.00)',
                    keyframes: [],
                    targetId: null
                };

                const select = document.getElementById('anim-select');
                const opt = document.createElement('option');
                opt.value = name;
                opt.innerText = name;
                select.appendChild(opt);
                select.value = name;
                this.selectAnimation(name);
            }
        });
    },

    selectAnimation: function(name) {
        if (!name) {
            this.currentAnim = null;
            this.renderTimeline();
            return;
        }
        this.currentAnim = name;
        const anim = this.animations[name];

        document.getElementById('anim-duration').value = anim.duration;

        const iterInput = document.getElementById('anim-iter');
        const infInput = document.getElementById('anim-infinite');

        if (anim.iter === 'inf') {
            iterInput.disabled = true;
            infInput.checked = true;
        } else {
            iterInput.value = anim.iter;
            iterInput.disabled = false;
            infInput.checked = false;
        }

        document.getElementById('anim-target-display').innerText = anim.targetId ? '#' + anim.targetId : 'None selected';

        // Update Graph
        if (this.bezierEditor) {
            if (anim.easing && anim.easing.startsWith('cubic-bezier')) {
                const matches = anim.easing.match(/cubic-bezier\(([\d\.]+), ([\d\.]+), ([\d\.]+), ([\d\.]+)\)/);
                if (matches) {
                    this.bezierEditor.setPoints(parseFloat(matches[1]), parseFloat(matches[2]), parseFloat(matches[3]), parseFloat(matches[4]));

                    document.getElementById('bezier-val-p1').innerText = `${matches[1]}, ${matches[2]}`;
                    document.getElementById('bezier-val-p2').innerText = `${matches[3]}, ${matches[4]}`;
                }
            } else {
                this.setEasingPreset('ease');
            }
        }

        this.renderTimeline();
    },

    assignAnimationToSelected: function() {
        if (!this.currentAnim) {
             this.showModal({ title: 'Error', message: 'Select an animation first.' });
             return;
        }
        if (!Builder.selectedElement) {
             this.showModal({ title: 'Error', message: 'Select an element in the builder first.' });
             return;
        }

        // Ensure element has ID
        if (!Builder.selectedElement.id) {
            Builder.selectedElement.id = 'el-' + Date.now();
        }

        this.animations[this.currentAnim].targetId = Builder.selectedElement.id;
        document.getElementById('anim-target-display').innerText = '#' + Builder.selectedElement.id;

        // Show feedback
        const btn = document.querySelector('#anim-target-display + button');
        const originalText = btn.innerText;
        btn.innerText = 'Assigned!';
        setTimeout(() => btn.innerText = originalText, 1000);

        this.generateAnimationCSS();
    },

    renderTimeline: function() {
        const trackContainer = document.getElementById('timeline-tracks');
        if (!this.currentAnim) {
            trackContainer.innerHTML = '<div class="empty-state">Select an animation</div>';
            return;
        }

        const anim = this.animations[this.currentAnim];

        let html = '';
        anim.keyframes.sort((a,b) => a.time - b.time).forEach((kf, idx) => {
            html += `
            <div class="timeline-kf" style="margin-bottom: 5px; background: #333; padding: 4px; border-radius: 4px; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--text-accent); font-weight:bold;">${kf.time}%</span>
                <span style="font-size:11px; color:#888;">${Object.keys(kf.props).length} props</span>
                <button onclick="App.removeKeyframe(${idx})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
            </div>`;
        });

        if (anim.keyframes.length === 0) {
            html = '<div style="padding:10px; color:#666;">No keyframes. Click "Add Keyframe".</div>';
        }

        trackContainer.innerHTML = html;
    },

    addKeyframe: function() {
        if (!this.currentAnim) {
            this.showModal({ title: 'Info', message: 'Select an animation first' });
            return;
        }

        this.showModal({
            title: 'Add Keyframe',
            message: 'Enter time percentage (0-100):',
            showInput: true,
            defaultValue: '0',
            onOk: (time) => {
                if (time === null) return;

                const props = {};
                if (Builder.selectedElement) {
                    // Capture common animatable properties
                    const s = Builder.selectedElement.style;
                    if (s.transform) props['transform'] = s.transform;
                    if (s.opacity) props['opacity'] = s.opacity;
                    if (s.backgroundColor) props['background-color'] = s.backgroundColor;
                    if (s.width) props['width'] = s.width;
                    if (s.height) props['height'] = s.height;
                    if (s.left) props['left'] = s.left;
                    if (s.top) props['top'] = s.top;
                }

                this.animations[this.currentAnim].keyframes.push({
                    time: parseInt(time),
                    props: props
                });

                this.renderTimeline();
                this.generateAnimationCSS();
            }
        });
    },

    removeKeyframe: function(idx) {
        if (!this.currentAnim) return;
        this.animations[this.currentAnim].keyframes.splice(idx, 1);
        this.renderTimeline();
        this.generateAnimationCSS();
    },

    generateAnimationCSS: function() {
        let css = '';
        for (let name in this.animations) {
            const anim = this.animations[name];
            css += `@keyframes ${name} {\n`;
            anim.keyframes.forEach(kf => {
                css += `  ${kf.time}% { `;
                for (let p in kf.props) css += `${p}: ${kf.props[p]}; `;
                css += `}\n`;
            });
            css += `}\n`;

            // If targetId is set, use ID selector, otherwise use class
            const selector = anim.targetId ? `#${anim.targetId}` : `.anim-${name}`;

            css += `${selector}.anim-active {\n`;
            css += `  animation-name: ${name};\n`;
            css += `  animation-duration: ${anim.duration}s;\n`;
            css += `  animation-iteration-count: ${anim.iter === 'inf' ? 'infinite' : anim.iter};\n`;
            css += `  animation-timing-function: ${anim.easing || 'ease'};\n`;
            css += `  animation-fill-mode: forwards;\n`;
            css += `}\n`;
        }

        const frame = document.getElementById('preview-frame');
        // Fix for non-iframe preview
        if (!frame) {
             let style = document.getElementById('vuc-animations');
             if (!style) {
                 style = document.createElement('style');
                 style.id = 'vuc-animations';
                 document.head.appendChild(style);
             }
             style.innerHTML = css;
             return;
        }
        const doc = frame.contentDocument || frame.contentWindow.document;
        let style = doc.getElementById('vuc-animations');
        if (!style) {
            style = doc.createElement('style');
            style.id = 'vuc-animations';
            doc.head.appendChild(style);
        }
        style.innerHTML = css;
    },

    playAnimation: function() {
        if (!this.currentAnim) return;

        const anim = this.animations[this.currentAnim];
        let el;

        if (anim.targetId) {
            el = document.getElementById(anim.targetId); // Look in main doc
            // Also look in iframe
            const frame = document.getElementById('preview-frame');
            if (frame) {
                const doc = frame.contentDocument || frame.contentWindow.document;
                const frameEl = doc.getElementById(anim.targetId);
                if (frameEl) el = frameEl;
            }
        } else {
            el = Builder.selectedElement;
        }

        if (!el) {
            this.showModal({ title: 'Info', message: 'No target element found for this animation.' });
            return;
        }

        el.classList.remove('anim-active');
        void el.offsetWidth; // Trigger reflow
        el.classList.add('anim-active');
    },

    pauseAnimation: function() {
        // Find all active animations
        const active = document.querySelectorAll('.anim-active');
        active.forEach(el => el.style.animationPlayState = 'paused');

        // Iframe
        const frame = document.getElementById('preview-frame');
        if (frame) {
            const doc = frame.contentDocument || frame.contentWindow.document;
            doc.querySelectorAll('.anim-active').forEach(el => el.style.animationPlayState = 'paused');
        }
    },

    stopAnimation: function() {
        const active = document.querySelectorAll('.anim-active');
        active.forEach(el => {
            el.classList.remove('anim-active');
            el.style.animationPlayState = '';
        });

        // Iframe
        const frame = document.getElementById('preview-frame');
        if (frame) {
            const doc = frame.contentDocument || frame.contentWindow.document;
            doc.querySelectorAll('.anim-active').forEach(el => {
                el.classList.remove('anim-active');
                el.style.animationPlayState = '';
            });
        }
    },

    exportAnimation: function() {
        if (!this.currentAnim) return;
        const anim = this.animations[this.currentAnim];

        let css = `@keyframes ${this.currentAnim} {\n`;
        anim.keyframes.sort((a,b) => a.time - b.time).forEach(kf => {
            css += `  ${kf.time}% { `;
            for (let p in kf.props) css += `${p}: ${kf.props[p]}; `;
            css += `}\n`;
        });
        css += `}\n\n`;

        const selector = anim.targetId ? `#${anim.targetId}` : `.anim-${this.currentAnim}`;
        css += `${selector} {\n`;
        css += `  animation-name: ${this.currentAnim};\n`;
        css += `  animation-duration: ${anim.duration}s;\n`;
        css += `  animation-iteration-count: ${anim.iter === 'inf' ? 'infinite' : anim.iter};\n`;
        css += `  animation-timing-function: ${anim.easing || 'ease'};\n`;
        css += `  animation-fill-mode: forwards;\n`;
        css += `}`;

        this.showModal({
            title: 'Export CSS',
            message: 'Copy the CSS below:',
            showInput: true,
            defaultValue: css
        });
    },

    // --- Saved Blocks Logic ---
    savedBlocks: [],

    initSavedBlocks: function() {
        const stored = localStorage.getItem('vuc_saved_blocks');
        if (stored) {
            this.savedBlocks = JSON.parse(stored);
        }
        this.renderSavedBlocks();
    },

        getStylesForElement: function(el) {
        let css = '';
        const styleEl = document.getElementById('vuc-custom-styles');
        if (!styleEl) return '';
        const sheet = styleEl.sheet;
        const selector = '#' + el.id;
        if (!el.id) return '';

        for (let i = 0; i < sheet.cssRules.length; i++) {
            const rule = sheet.cssRules[i];
            if (rule.selectorText && rule.selectorText.includes(selector)) {
                css += rule.cssText + '\n';
            }
        }
        return css;
    },

    getJSForElement: function(el) {
        let js = '';
        const events = ['onclick', 'onchange', 'oninput', 'onsubmit'];
        events.forEach(evt => {
            if (el.hasAttribute(evt)) {
                js += `// ${evt} handler\n${el.getAttribute(evt)}\n`;
            }
        });
        return js;
    },

    saveCurrentBlock: function() {
        const el = Builder.selectedElement;
        if (!el) {
            this.showModal({ title: 'Info', message: 'Select an element to save.' });
            return;
        }

        this.showModal({
            title: 'Save Block',
            message: 'Enter name for this block:',
            showInput: true,
            defaultValue: 'My Block',
            onOk: (name) => {
                if (!name) return;

                // Clone and clean
                const clone = el.cloneNode(true);
                clone.classList.remove('selected');
                clone.classList.remove('dropped-element');

                // Use a temporary container to get HTML
                const temp = document.createElement('div');
                temp.appendChild(clone);

                const block = {
                    id: 'block-' + Date.now(),
                    name: name,
                    html: temp.innerHTML,
                    css: this.getStylesForElement(el),
                    js: this.getJSForElement(el),
                    timestamp: new Date().toLocaleString()
                };

                this.savedBlocks.push(block);
                this.saveBlocksToStorage();
                this.renderSavedBlocks();

                // Show sidebar
                this.switchSidebar('html');
                const cat = document.getElementById('category-saved-blocks');
                if (cat) {
                    cat.style.display = 'block';
                    cat.classList.remove('collapsed');
                }
            }
        });
    },

    deleteSavedBlock: function(id) {
        this.showModal({
            title: 'Delete Block',
            message: 'Are you sure you want to delete this saved block?',
            showInput: false,
            onOk: () => {
                this.savedBlocks = this.savedBlocks.filter(b => b.id !== id);
                this.saveBlocksToStorage();
                this.renderSavedBlocks();
            }
        });
    },

    saveBlocksToStorage: function() {
        localStorage.setItem('vuc_saved_blocks', JSON.stringify(this.savedBlocks));
    },

    renderSavedBlocks: function() {
        const container = document.getElementById('saved-blocks-list');
        const category = document.getElementById('category-saved-blocks');

        if (!container || !category) return;

        if (this.savedBlocks.length === 0) {
            category.style.display = 'none';
            return;
        }

        category.style.display = 'block';
        container.innerHTML = '';

        this.savedBlocks.forEach(block => {
            const item = document.createElement('div');
            item.className = 'draggable-item';
            item.draggable = true;
            item.dataset.type = 'saved-block';
            item.dataset.blockId = block.id;

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <span><i class="fas fa-cube"></i> ${block.name}</span>
                    <i class="fas fa-trash" style="color:#666; font-size:10px; cursor:pointer;" onclick="event.stopPropagation(); App.deleteSavedBlock('${block.id}')"></i>
                </div>
            `;

            // Drag Start
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', 'saved-block');
                e.dataTransfer.setData('application/vuc-block-id', block.id);
                e.dataTransfer.effectAllowed = 'copy';
                if (window.Builder) window.Builder.draggedType = 'saved-block';
            });

            container.appendChild(item);
        });
    },

    // --- Script Editor Logic ---
    runScript: function() {
        let code = '';

        if (window.scriptEditor) {
            code = window.scriptEditor.getValue();
        } else {
            const scriptArea = document.getElementById('script-editor-area');
            if (scriptArea) code = scriptArea.value;
        }

        if (!code || !code.trim()) {
             this.logConsole('Script is empty.', 'info');
             return;
        }

        this.logConsole('Running script...', 'info');

        try {
            // Execute in global scope but try to target canvas
            // We wrap in an IIFE
            const safeCode = `(function() {
                const canvas = document.getElementById('preview-canvas');
                ${code}
            })();`;

            window.eval(safeCode);
            this.logConsole('Script executed.', 'success');
        } catch (e) {
            this.logConsole(`Script Error: ${e.message}`, 'error');
        }
    },

    // --- JS Console Logic ---
    runConsole: function(code) {
        if (!code) code = document.getElementById('console-input').value;
        if (!code) return;

        this.logConsole(`> ${code}`, 'info');

        try {
            // Fix: Use window instead of iframe
            const result = window.eval(code);
            this.logConsole(`<- ${result}`, 'success');
        } catch (e) {
            this.logConsole(`Error: ${e.message}`, 'error');
        }

        document.getElementById('console-input').value = '';
    },

    logConsole: function(msg, type='info') {
        const out = document.getElementById('js-console-output');
        const div = document.createElement('div');
        div.className = `log-${type}`;
        div.innerText = msg;
        div.style.borderBottom = '1px solid #333';
        div.style.padding = '2px 0';
        if (type === 'error') div.style.color = '#f44336';
        if (type === 'success') div.style.color = '#4caf50';

        out.appendChild(div);
        out.scrollTop = out.scrollHeight;
    },

    clearConsole: function() {
        document.getElementById('js-console-output').innerHTML = '<div class="log-info">Console cleared.</div>';
    },

    saveLayout: function() {
        const sidebar = document.getElementById('component-sidebar');
        const codePanel = document.getElementById('code-editor-panel');
        const previewPanel = document.getElementById('preview-panel');
        const editorContent = document.getElementById('editor-content-wrapper');
        const bottomPanel = document.getElementById('bottom-panel');

        // Find active bottom tab
        const activeTabBtn = document.querySelector('.panel-tabs button.active');
        let activeTab = 'terminal'; // Default
        if (activeTabBtn) {
            // Infer tab from onclick attribute or text
            const onclick = activeTabBtn.getAttribute('onclick');
            if (onclick && onclick.includes("'timeline'")) activeTab = 'timeline';
            else if (onclick && onclick.includes("'console'")) activeTab = 'console';
            else if (onclick && onclick.includes("'script'")) activeTab = 'script';
        }

        const layout = {
            sidebarWidth: sidebar ? sidebar.style.width : '',
            codePanelFlex: codePanel ? codePanel.style.flex : '',
            previewPanelFlex: previewPanel ? previewPanel.style.flex : '',
            editorHeight: editorContent ? editorContent.style.height : '',
            terminalHeight: bottomPanel ? bottomPanel.style.height : '',
            activeBottomTab: activeTab
        };
        localStorage.setItem('vuc_layout', JSON.stringify(layout));
    },

    loadLayout: function() {
        try {
            const layout = JSON.parse(localStorage.getItem('vuc_layout'));
            if (layout) {
                const sidebar = document.getElementById('component-sidebar');
                const codePanel = document.getElementById('code-editor-panel');
                const previewPanel = document.getElementById('preview-panel');
                const editorContent = document.getElementById('editor-content-wrapper');
                const bottomPanel = document.getElementById('bottom-panel');

                if (layout.sidebarWidth && sidebar) sidebar.style.width = layout.sidebarWidth;
                if (layout.codePanelFlex && codePanel) codePanel.style.flex = layout.codePanelFlex;
                if (layout.previewPanelFlex && previewPanel) previewPanel.style.flex = layout.previewPanelFlex;
                if (layout.editorHeight && editorContent) editorContent.style.height = layout.editorHeight;
                if (layout.terminalHeight && bottomPanel) bottomPanel.style.height = layout.terminalHeight;

                if (layout.activeBottomTab) {
                    this.switchBottomPanel(layout.activeBottomTab);
                }
            }
        } catch(e) { console.error('Error loading layout', e); }
    },

    resetLayout: function() {
        this.showModal({
            title: 'Reset Layout',
            message: 'Are you sure you want to reset the layout to default settings?',
            showInput: false,
            onOk: () => {
                // Clear saved layout
                localStorage.removeItem('vuc_layout');

                // Reset Sidebar
                const sidebar = document.getElementById('component-sidebar');
                if (sidebar) sidebar.style.width = '';

                // Reset Code/Preview Split
                const codePanel = document.getElementById('code-editor-panel');
                const previewPanel = document.getElementById('preview-panel');
                if (codePanel) codePanel.style.flex = '';
                if (previewPanel) previewPanel.style.flex = '';

                // Reset Editor/Terminal Split
                const editorContent = document.getElementById('editor-content-wrapper');
                const bottomPanel = document.getElementById('bottom-panel');
                if (editorContent) editorContent.style.height = '';
                if (bottomPanel) bottomPanel.style.height = '';

                // Feedback
                App.showModal({ title: 'Success', message: 'Layout has been reset to default configuration.' });
            }
        });
    },

    // --- Color Management ---
    projectColors: [],

    importColorsJSON: function() {
        document.getElementById('color-import-input').click();
    },

    handleColorImport: function(input) {
        if (!input.files || input.files.length === 0) return;
        const file = input.files[0];

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if (!Array.isArray(json)) {
                    alert('Invalid JSON: Must be an array of color objects.');
                    return;
                }

                let importedCount = 0;
                json.forEach(item => {
                    // Normalize to internal structure
                    // Required: name, value
                    // Optional: type (hex, rgb, hsl, rgba), variable

                    if (!item.name || !item.value) return;

                    // Check if already exists
                    const exists = this.projectColors.some(c => c.value === item.value || c.name === item.name);
                    if (!exists) {
                        const newColor = {
                            name: item.name,
                            value: item.value,
                            type: item.type || 'hex', // default
                            variable: item.variable || null
                        };
                        this.projectColors.push(newColor);
                        importedCount++;
                    }
                });

                if (importedCount > 0) {
                    this.saveProjectColors();
                    alert(`Imported ${importedCount} colors.`);
                } else {
                    alert('No new colors imported.');
                }

            } catch (err) {
                console.error('Error parsing JSON:', err);
                alert('Error parsing JSON file.');
            }
            input.value = ''; // Reset input
        };
        reader.readAsText(file);
    },

    generateColorVariables: function() {
        let updatedCount = 0;
        this.projectColors.forEach(color => {
            if (!color.variable) {
                // Generate variable name from color name
                // "Dark Blue" -> "--dark-blue"
                let varName = '--' + color.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                // Ensure valid CSS var
                if (!varName.startsWith('--')) varName = '--color-' + varName; // fallback

                // Check uniqueness?
                // Simple collision avoidance
                let suffix = 1;
                let originalVarName = varName;
                while (this.projectColors.some(c => c.variable === varName && c !== color)) {
                    varName = originalVarName + '-' + suffix++;
                }

                color.variable = varName;
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            this.saveProjectColors();
            alert(`Generated CSS variables for ${updatedCount} colors.`);
        } else {
            alert('All colors already have CSS variables.');
        }
    },

    loadProjectColors: function() {
        try {
            const raw = JSON.parse(localStorage.getItem('vuc_project_colors') || '[]');
            // Migration: Convert strings to objects
            this.projectColors = raw.map(c => {
                if (typeof c === 'string') {
                    return { value: c, name: c, variable: null };
                }
                return c;
            });

            if (this.projectColors.length === 0) {
                 this.projectColors = [
                     { value: '#007acc', name: 'Blue', variable: '--primary-color' },
                     { value: '#ff5722', name: 'Orange', variable: '--accent-color' },
                     { value: '#333333', name: 'Dark', variable: null },
                     { value: '#ffffff', name: 'White', variable: null }
                 ];
            }
        } catch(e) {
            this.projectColors = [];
        }
        this.renderProjectColors();
        this.updateRootVariables();
    },

    saveProjectColors: function() {
        localStorage.setItem('vuc_project_colors', JSON.stringify(this.projectColors));
        this.renderProjectColors();
        this.updateRootVariables();
    },

    updateRootVariables: function() {
        let css = ':root {\n';
        this.projectColors.forEach(c => {
            if (c.variable) {
                css += `  ${c.variable}: ${c.value};\n`;
            }
        });
        css += '}\n';

        // Update main document
        let style = document.getElementById('vuc-root-vars');
        if (!style) {
            style = document.createElement('style');
            style.id = 'vuc-root-vars';
            document.head.appendChild(style);
        }
        style.innerHTML = css;

        // Update Preview Frame
        const frame = document.getElementById('preview-frame');
        if (frame) {
            const doc = frame.contentDocument || frame.contentWindow.document;
            let fStyle = doc.getElementById('vuc-root-vars');
            if (!fStyle) {
                fStyle = doc.createElement('style');
                fStyle.id = 'vuc-root-vars';
                doc.head.appendChild(fStyle);
            }
            fStyle.innerHTML = css;
        }
    },

    showExportToJSModal: function(el) {
        if (!el) return;

        // Fetch JS/TS files
        fetch('/api/list_files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: this.currentProjectPath, recursive: true })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert('Error fetching files: ' + data.error);
                return;
            }

            const jsFiles = data.items.filter(f => f.type === 'file' && /\.(js|ts)$/i.test(f.name));

            if (jsFiles.length === 0) {
                alert('No JS/TS files found in project.');
                return;
            }

            // Create Modal Content
            const content = document.createElement('div');
            content.style.padding = '10px';

            content.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <label style="display:block; margin-bottom:5px; color:#ccc;">Select Target File:</label>
                    <select id="export-js-file" class="prop-input" style="width:100%;">
                        ${jsFiles.map(f => `<option value="${f.path}">${f.name} (${f.path.replace(this.currentProjectPath, '').replace(/^[\/\\]/, '')})</option>`).join('')}
                    </select>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display:block; margin-bottom:5px; color:#ccc;">Event Type:</label>
                    <select id="export-js-event" class="prop-input" style="width:100%;">
                        <option value="click">Click (onclick)</option>
                        <option value="mouseover">Mouse Over (hover)</option>
                        <option value="mouseout">Mouse Out</option>
                        <option value="change">Change (input)</option>
                        <option value="input">Input (typing)</option>
                        <option value="submit">Submit (form)</option>
                        <option value="keydown">Key Down</option>
                        <option value="keyup">Key Up</option>
                        <option value="DOMContentLoaded">On Load (document)</option>
                    </select>
                </div>
                <div style="margin-bottom: 15px;">
                     <label style="display:block; margin-bottom:5px; color:#ccc;">Preview:</label>
                     <pre id="export-js-preview" style="background:#1e1e1e; padding:10px; border-radius:4px; font-size:12px; overflow-x:auto; color:#d4d4d4; white-space: pre-wrap;"></pre>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button id="btn-cancel-export" class="btn-secondary">Cancel</button>
                    <button id="btn-confirm-export" class="btn-primary">Export Code</button>
                </div>
            `;

            // Logic to update preview
            const updatePreview = () => {
                const event = content.querySelector('#export-js-event').value;
                const code = this.generateExportCode(el, event);
                content.querySelector('#export-js-preview').innerText = code;
            };

            content.querySelector('#export-js-file').onchange = updatePreview;
            content.querySelector('#export-js-event').onchange = updatePreview;

            // Initial preview
            setTimeout(updatePreview, 0);

            // Modal
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-box" style="width: 500px;">
                    <div class="modal-header">Export to JS <i class="fas fa-times close-modal"></i></div>
                    <div class="modal-body"></div>
                </div>
            `;
            modal.querySelector('.modal-body').appendChild(content);
            document.body.appendChild(modal);

            // Close logic
            const close = () => {
                if(document.body.contains(modal)) document.body.removeChild(modal);
            };
            modal.querySelector('.close-modal').onclick = close;
            content.querySelector('#btn-cancel-export').onclick = close;

            content.querySelector('#btn-confirm-export').onclick = () => {
                const file = content.querySelector('#export-js-file').value;
                const event = content.querySelector('#export-js-event').value;
                this.exportElementToJS(file, event, el);
                close();
            };
        });
    },

    generateExportCode: function(el, eventType) {
        let selector = '';
        if (el.id) {
            selector = `document.getElementById('${el.id}')`;
        } else if (el.className) {
             const cls = el.className.split(' ').filter(c => c !== 'selected' && c !== 'dropped-element')[0];
             selector = cls ? `document.querySelector('.${cls}')` : `document.querySelector('${el.tagName.toLowerCase()}')`;
        } else {
             selector = `document.querySelector('${el.tagName.toLowerCase()}')`;
        }

        return `
// Event Listener for ${el.tagName.toLowerCase()} ${el.id ? '#' + el.id : ''}
if (${selector}) {
    ${selector}.addEventListener('${eventType}', function(e) {
        // TODO: Handle ${eventType} logic
        console.log('${eventType} triggered on ${el.tagName.toLowerCase()}');
    });
}`;
    },

    exportElementToJS: function(filePath, eventType, el) {
        const code = this.generateExportCode(el, eventType);

        fetch('/api/append_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, content: code })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('Code exported successfully!');
            } else {
                alert('Error exporting code: ' + data.error);
            }
        });
    },

            generateEventListener: function(el, eventType) {
        if (!el) return;
        const tagName = el.tagName.toLowerCase();
        let nameBase = el.id || (el.className ? el.className.split(' ').filter(c => c !== 'dropped-element' && c !== 'selected')[0] : '') || tagName;
        const varName = nameBase.replace(/[^a-z0-9]/gi, '_');

        let selector = el.id ? `#${el.id}` : (el.className ? `.${el.className.split(' ').filter(c => c !== 'dropped-element' && c !== 'selected')[0]}` : tagName);
        if (!selector) selector = tagName;

        const isTS = this.isTSMode || false;
        const cast = isTS ? ` as HTML${tagName.charAt(0).toUpperCase() + tagName.slice(1)}Element` : '';

        const code = `\nconst ${varName} = document.querySelector('${selector}')${cast};\n${varName}.addEventListener('${eventType}', (e) => {\n    \n});`;

        document.querySelectorAll('.code-tabs button').forEach(t => { if(t.dataset.lang === 'js') t.click(); });

        if (window.monacoEditor) {
            const model = window.monacoEditor.getModel();
            const lineCount = model.getLineCount();
            window.monacoEditor.executeEdits('event-preset', [{
                range: new monaco.Range(lineCount + 1, 1, lineCount + 1, 1),
                text: code,
                forceMoveMarkers: true
            }]);

            const targetLine = lineCount + 3;
            window.monacoEditor.setPosition({ lineNumber: targetLine, column: 5 });
            window.monacoEditor.revealLine(targetLine);
            window.monacoEditor.focus();
        }
    },

    importElementToJS: function(el) {
        if (!el) return;
        const tagName = el.tagName.toLowerCase();
        let nameBase = el.id || (el.className ? el.className.split(' ').filter(c => c !== 'dropped-element' && c !== 'selected')[0] : '') || tagName;
        const varName = nameBase.replace(/[^a-z0-9]/gi, '_');

        const isTS = this.isTSMode || false;
        const cast = isTS ? ` as HTML${tagName.charAt(0).toUpperCase() + tagName.slice(1)}Element` : '';

        let selector = '';
        if (el.id) selector = `#${el.id}`;
        else if (el.className) {
            const cls = el.className.split(' ').filter(c => c !== 'dropped-element' && c !== 'selected')[0];
            selector = cls ? `.${cls}` : tagName;
        } else selector = tagName;

        const code = `const ${varName} = document.querySelector('${selector}')${cast};`;

        // Switch to JS tab in editor
        document.querySelectorAll('.code-tabs button').forEach(t => {
            if(t.dataset.lang === 'js') t.click();
        });

        if (window.monacoEditor) {
            const model = window.monacoEditor.getModel();
            const lineCount = model.getLineCount();
            const range = new monaco.Range(lineCount + 1, 1, lineCount + 1, 1);
            window.monacoEditor.executeEdits('import', [{
                range: range,
                text: (lineCount > 1 ? '\n' : '') + code,
                forceMoveMarkers: true
            }]);
            window.monacoEditor.revealLine(lineCount + 1);
            window.monacoEditor.focus();
        }
    },

    renderProjectColors: function() {
        const grid = document.getElementById('project-colors');
        if (!grid) return;

        grid.innerHTML = '';

        this.projectColors.forEach(colorObj => {
            const color = colorObj.value;
            const div = document.createElement('div');
            div.className = 'color-swatch';
            div.style.setProperty('--bg', color);
            div.title = `${colorObj.name}\n${color}${colorObj.variable ? '\n' + colorObj.variable : ''}`;

            let label = colorObj.name;
            if (colorObj.variable) label += `<br><span style="opacity:0.7; font-size:10px">${colorObj.variable}</span>`;

            div.innerHTML = `<div class="color-preview" style="background:${color}"></div>
                             <div class="color-info" style="font-size:11px; padding:4px; overflow:hidden; line-height:1.2; white-space:normal;">${label}</div>`;

            div.onclick = () => {
                const valToApply = colorObj.variable ? `var(${colorObj.variable})` : color;

                if (Builder.selectedElement) {
                    // Check if we are in a specific input context?
                    // For now just apply to background as default or try to be smart?
                    // The old behavior was background.
                    // But if the user is editing text color, they might want to apply it there.
                    // Ideally we should drag and drop, but click is faster.

                    // Let's ask or just apply to background for now as it's the most common.
                    // Better: Copy to clipboard if not selected, apply if selected.

                    App.applyStyle('backgroundColor', valToApply);
                    App.logConsole(`Applied ${colorObj.name}`, 'success');
                } else {
                    navigator.clipboard.writeText(valToApply).then(() => {
                        App.logConsole(`Copied ${valToApply}`, 'success');
                    });
                }
            };

            div.oncontextmenu = (e) => {
                e.preventDefault();
                if (confirm(`Remove color ${colorObj.name}?`)) {
                    this.projectColors = this.projectColors.filter(c => c !== colorObj);
                    this.saveProjectColors();
                }
            };

            grid.appendChild(div);
        });
    },

    saveColorFromStudio: function() {
        const hex = document.getElementById('cs-hex').value;
        const name = document.getElementById('cs-name').value || hex;
        const isVar = document.getElementById('cs-is-var').checked;
        let varName = document.getElementById('cs-var-name').value;

        if (isVar && !varName) {
            // Auto-generate variable name
            varName = '--' + name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        }

        const newColor = {
            value: hex,
            name: name,
            variable: isVar ? varName : null
        };

        // Check duplicates
        const exists = this.projectColors.find(c => c.value === hex || (c.variable && c.variable === varName));
        if (exists) {
            if (!confirm('Color or variable already exists. Add anyway?')) return;
        }

        this.projectColors.push(newColor);
        this.saveProjectColors();
        this.closeColorStudio();
        this.logConsole(`Added color ${name}`, 'success');
    },

    openColorPaletteManager: function() {
        // Modal for managing colors
        const container = document.createElement('div');

        // Import Area
        const importLabel = document.createElement('label');
        importLabel.innerText = 'Import Colors (Hex, RGB, HSL or JSON):';
        importLabel.style.display = 'block';
        importLabel.style.marginBottom = '5px';
        container.appendChild(importLabel);

        const textarea = document.createElement('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '100px';
        textarea.className = 'prop-input';
        textarea.placeholder = '#ffffff, rgb(0,0,0)\nOR JSON: [{"value":"#ff0000", "name":"Red", "variable":"--red"}]';
        container.appendChild(textarea);

        // Options
        const optionsDiv = document.createElement('div');
        optionsDiv.style.marginBottom = '10px';

        const replaceCheck = document.createElement('input');
        replaceCheck.type = 'checkbox';
        replaceCheck.id = 'import-replace';

        const replaceLabel = document.createElement('label');
        replaceLabel.htmlFor = 'import-replace';
        replaceLabel.innerText = ' Replace existing palette';
        replaceLabel.style.marginLeft = '5px';

        optionsDiv.appendChild(replaceCheck);
        optionsDiv.appendChild(replaceLabel);
        container.appendChild(optionsDiv);

        // Swatch List
        const listLabel = document.createElement('div');
        listLabel.innerText = 'Current Palette (Click to remove):';
        listLabel.style.margin = '10px 0 5px';
        container.appendChild(listLabel);

        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexWrap = 'wrap';
        list.style.gap = '5px';

        const renderList = () => {
            list.innerHTML = '';
            this.projectColors.forEach((c, idx) => {
                const swatch = document.createElement('div');
                swatch.style.width = '24px';
                swatch.style.height = '24px';
                swatch.style.backgroundColor = c.value;
                swatch.style.border = '1px solid #555';
                swatch.style.cursor = 'pointer';
                swatch.title = `Remove ${c.name} (${c.value})`;
                swatch.onclick = () => {
                    this.projectColors.splice(idx, 1);
                    this.saveProjectColors();
                    renderList();
                };
                list.appendChild(swatch);
            });
        };
        renderList();
        container.appendChild(list);

        this.showModal({
            title: 'Manage Color Palette',
            message: '',
            showInput: false,
            onOk: () => {
                // Process Import
                const text = textarea.value.trim();
                if (!text) return;

                let newColors = [];
                let isJson = false;

                // Try JSON first
                if (text.startsWith('[') || text.startsWith('{')) {
                    try {
                        const data = JSON.parse(text);
                        isJson = true;

                        const extract = (item) => {
                            if (typeof item === 'string') {
                                return { value: item, name: item, variable: null };
                            }
                            if (typeof item === 'object' && item) {
                                const val = item.value || item.color || item.hex || item.rgb;
                                if (val) {
                                    return {
                                        value: val,
                                        name: item.name || val,
                                        variable: item.variable || null
                                    };
                                }
                            }
                            return null;
                        };

                        let itemsToProcess = [];
                        if (Array.isArray(data)) {
                            itemsToProcess = data;
                        } else if (typeof data === 'object') {
                            itemsToProcess = data.colors || data.palette || data.items || [];
                        }

                        itemsToProcess.forEach(item => {
                            const c = extract(item);
                            if (c) newColors.push(c);
                        });

                    } catch (e) {
                        console.warn('JSON parse failed, falling back to regex', e);
                        isJson = false;
                    }
                }

                // Fallback to Regex
                if (!isJson || newColors.length === 0) {
                     const hexRegex = /#[0-9a-fA-F]{3,8}/g;
                     const rgbRegex = /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/g;
                     const hslRegex = /hsl\(\s*\d+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*\)|hsla\(\s*\d+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+\s*\)/g;

                     const hexMatches = text.match(hexRegex) || [];
                     const rgbMatches = text.match(rgbRegex) || [];
                     const hslMatches = text.match(hslRegex) || [];

                     [...hexMatches, ...rgbMatches, ...hslMatches].forEach(match => {
                         newColors.push({
                             value: match,
                             name: match,
                             variable: null
                         });
                     });
                }

                if (newColors.length > 0) {
                    if (replaceCheck.checked) {
                        this.projectColors = [];
                    }

                    newColors.forEach(c => {
                        // Check duplicate by value
                        const exists = this.projectColors.find(existing => existing.value === c.value);
                        if (!exists) {
                            this.projectColors.push(c);
                        }
                    });
                    this.saveProjectColors();
                    this.logConsole(`Imported ${newColors.length} colors`, 'success');
                } else {
                    this.logConsole('No valid colors found to import', 'warning');
                }

                // Refresh Inspector if open
                if (Builder.selectedElement) this.updatePropertyInspector(Builder.selectedElement);
            }
        });

        // Append custom container to modal message body
        const msgEl = document.getElementById('generic-modal-message');
        if (msgEl) {
            msgEl.innerHTML = '';
            msgEl.appendChild(container);
        }
    },

    // --- Code Highlighting ---
    highlightCodeForElement: function(el) {
        if (!window.monacoEditor) return;
        const model = window.monacoEditor.getModel();
        if (!model) return;

        let range = null;

        // 1. Try ID
        if (el.id) {
            const matches = model.findMatches('id="' + el.id + '"', false, false, false, null, true);
            if (matches && matches.length > 0) range = matches[0].range;
        }

        // 2. Try Class + Tag
        if (!range && el.className && typeof el.className === 'string') {
             const classes = el.className.replace('selected', '').replace('dropped-element', '').trim();
             if (classes) {
                 const pattern = 'class="' + classes + '"';
                 const matches = model.findMatches(pattern, false, false, false, null, true);
                 if (matches && matches.length > 0) range = matches[0].range;
             }
        }

        if (range) {
            window.monacoEditor.revealRangeInCenter(range);
            window.monacoEditor.setSelection(range);
        }
    },

    initMonaco: function() {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            // Main Code Editor
            window.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: '',
                language: 'html',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                quickSuggestions: {
                    other: true,
                    comments: true,
                    strings: true
                },
                suggest: {
                    filterGraceful: true,
                    snippetsPreventQuickSuggestions: false
                }
            });

            // Script Editor
            const scriptContainer = document.getElementById('monaco-script-editor');
            if (scriptContainer) {
                window.scriptEditor = monaco.editor.create(scriptContainer, {
                    value: '// Write JavaScript here...\n// It runs in the context of the app (use window or document)\n\nconsole.log("Hello from Script Editor");',
                    language: 'javascript',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: false }
                });
            }

            // Bi-directional sync for main editor
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
        // Handle 'components' legacy call by mapping to 'structure'
        if (tab === 'components') tab = 'structure';
        if (tab === 'html') tab = 'structure'; // Map HTML tab to structure (merged)

        // Toggle active button
        const buttons = document.querySelectorAll('.sidebar-tabs button');
        buttons.forEach(b => {
             b.classList.remove('active');
        });

        // Hide all content sections
        const contents = document.querySelectorAll('.sidebar-content');
        contents.forEach(el => el.style.display = 'none');

        // Show active content
        const activeEl = document.getElementById('sidebar-content-' + tab);
        if (activeEl) {
            activeEl.style.display = 'flex';

            // Highlight tab button
            const btn = document.getElementById('tab-' + tab);
            if (btn) btn.classList.add('active');
        }

        if (tab === 'assets') this.loadAssets();
        if (tab === 'js') this.renderJSPanel();
        if (tab === 'files') this.refreshFileTree();
    },

    // --- File Tree Logic ---
    currentProjectPath: null,

    // --- File Management ---
    createNewFile: function(basePath = null) {
        const path = basePath || this.currentProjectPath;
        if (!path) {
            alert('Please open a project folder first.');
            return;
        }

        this.showModal({
            title: 'Create New File',
            message: `Create file in ${path.split('/').pop()}:`,
            showInput: true,
            defaultValue: 'new-file.html',
            onOk: (name) => {
                if (!name) return;
                const fullPath = path + '/' + name;

                // Create empty file
                fetch('/api/save_file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: fullPath, content: '' })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        alert('Error: ' + data.error);
                    } else {
                        this.logConsole(`Created file ${name}`, 'success');
                        if (basePath) {
                            this.expandedPaths.add(basePath);
                            this.saveExpandedPaths();
                        }
                        this.refreshFileTree();
                        this.openFile(fullPath);
                    }
                    this.closeModal();
                });
            }
        });
    },

    createNewFolder: function(basePath = null) {
        const path = basePath || this.currentProjectPath;
        if (!path) {
            alert('Please open a project folder first.');
            return;
        }

        this.showModal({
            title: 'Create New Folder',
            message: `Create folder in ${path.split('/').pop()}:`,
            showInput: true,
            defaultValue: 'new-folder',
            onOk: (name) => {
                if (!name) return;
                const fullPath = path + '/' + name;

                fetch('/api/create_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: fullPath })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        alert('Error: ' + data.error);
                    } else {
                        this.logConsole(`Created folder ${name}`, 'success');
                        if (basePath) {
                            this.expandedPaths.add(basePath);
                            this.saveExpandedPaths();
                        }
                        this.refreshFileTree();
                    }
                    this.closeModal();
                });
            }
        });
    },

    // --- Structure Tree (DOM View) ---

    toggleTouchMode: function() {
        this.isTouchMode = !this.isTouchMode;
        localStorage.setItem('vuc_touch_mode', this.isTouchMode);

        if (this.isTouchMode) {
            document.body.classList.add('touch-mode');
            this.logConsole('Touch Mode Enabled', 'success');
        } else {
            document.body.classList.remove('touch-mode');
            this.logConsole('Touch Mode Disabled', 'info');
        }

        this.renderStructureTree();
    },

    showSmartDeleteModal: function(element) {
        if (!element) return;

        // Remove existing modal if any
        const existing = document.getElementById('smart-delete-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'smart-delete-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="width: 400px;">
                <h3>Delete Element</h3>
                <p>How do you want to delete this &lt;${element.tagName.toLowerCase()}&gt;?</p>
                <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
                    <button id="btn-unwrap" class="btn secondary" style="justify-content: flex-start; text-align: left;">
                        <i class="fas fa-box-open" style="margin-right: 10px;"></i>
                        <div>
                            <strong>Unwrap (Keep Content)</strong>
                            <div style="font-size: 11px; opacity: 0.7;">Delete container, keep children</div>
                        </div>
                    </button>
                    <button id="btn-copy-delete" class="btn secondary" style="justify-content: flex-start; text-align: left;">
                        <i class="fas fa-copy" style="margin-right: 10px;"></i>
                        <div>
                            <strong>Copy & Delete</strong>
                            <div style="font-size: 11px; opacity: 0.7;">Copy HTML to clipboard, then delete</div>
                        </div>
                    </button>
                    <button id="btn-delete-all" class="btn danger" style="justify-content: flex-start; text-align: left;">
                        <i class="fas fa-trash-alt" style="margin-right: 10px;"></i>
                        <div>
                            <strong>Delete All</strong>
                            <div style="font-size: 11px; opacity: 0.7;">Delete element and all content</div>
                        </div>
                    </button>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button id="btn-cancel" class="btn text">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handlers
        modal.querySelector('#btn-cancel').onclick = () => modal.remove();

        modal.querySelector('#btn-unwrap').onclick = () => {
            const parent = element.parentNode;
            while (element.firstChild) {
                parent.insertBefore(element.firstChild, element);
            }
            element.remove();
            this.updateCode();
            this.saveState();
            this.renderStructureTree();
            modal.remove();
        };

        modal.querySelector('#btn-copy-delete').onclick = () => {
            const content = element.outerHTML;
            navigator.clipboard.writeText(content).then(() => {
                element.remove();
                this.updateCode();
                this.saveState();
                this.renderStructureTree();
                this.logConsole('Element copied and deleted', 'success');
                modal.remove();
            }).catch(err => {
                console.error('Failed to copy: ', err);
                element.remove();
                this.updateCode();
                this.saveState();
                this.renderStructureTree();
                modal.remove();
            });
        };

        modal.querySelector('#btn-delete-all').onclick = () => {
            element.remove();
            this.updateCode();
            this.saveState();
            this.renderStructureTree();
            modal.remove();
        };

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    },

    renderStructureTree: function() {
        const container = document.getElementById('structure-tree');
        if (!container) return;

        container.innerHTML = '';
        const root = document.getElementById('preview-canvas');
        if (!root) return;

        // Container Drop Zone (Append to Root or Handle File Drop)
        container.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            // Only highlight if not dragging a structure item (handled by items themselves)
            if (!this.draggingElement) {
                container.style.backgroundColor = 'rgba(0, 122, 204, 0.1)';
            }
        };
        container.ondragleave = (e) => {
            e.preventDefault();
            container.style.backgroundColor = '';
        };
        container.ondrop = (e) => {
            e.preventDefault();
            container.style.backgroundColor = '';

            // Check for File Drop first
            const fileData = e.dataTransfer.getData('application/x-visual-ui-file');
            if (fileData) {
                this.handleFileDrop(JSON.parse(fileData), root);
                return;
            }

            // Check for new Component Drop
            const type = e.dataTransfer.getData('text/plain');
            if (type && !type.includes('{') && type !== 'structure-item') {
                Builder.createElement(type, root);
                this.saveState();
                this.updateCode();
                this.renderStructureTree();
            }
        };

        // Ensure collapsed set exists
        this.collapsedElements = this.collapsedElements || new WeakSet();

        // Helper to build tree
        const buildTree = (element, depth = 0) => {
            // Skip internal elements if any
            if (element.classList.contains('preview-canvas')) {
                Array.from(element.children).forEach(child => buildTree(child, depth));
                return;
            }

            const item = document.createElement('div');
            item.domElement = element; // For touch events
            item.className = 'structure-item';
            item.dataset.depth = Math.min(depth, 4); // For heatmap CSS
            item.draggable = true;

            // Heatmap Indentation Lines
            for (let i = 0; i < depth; i++) {
                const line = document.createElement('div');
                line.className = 'indent-line';
                line.style.left = (i * 15 + 10) + 'px';
                item.appendChild(line);
            }

            // Sync Selection State
            if (Builder.selectedElements.includes(element)) {
                item.dataset.selected = 'true';
                item.style.borderLeft = '3px solid #00ff00';
            } else {
                item.dataset.selected = 'false';
                item.style.borderLeft = '3px solid transparent';
            }

            // Main Row Content
            const mainRow = document.createElement('div');
            mainRow.className = 'item-main-row';
            mainRow.style.paddingLeft = (depth * 15) + 'px';

            // 1. Left Handle (Drag/Reorder)
            const leftHandle = document.createElement('div');
            leftHandle.className = 'left-handle';
            leftHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
            mainRow.appendChild(leftHandle);

            // 2. Toggle Arrow (Expand/Collapse)
            const toggle = document.createElement('span');
            toggle.style.width = this.isTouchMode ? '30px' : '20px';
            toggle.style.display = 'inline-block';
            toggle.style.textAlign = 'center';
            toggle.style.cursor = 'pointer';

            if (element.children.length > 0) {
                const isCollapsed = this.collapsedElements.has(element);
                toggle.innerHTML = `<i class="fas fa-chevron-${isCollapsed ? 'right' : 'down'}" style="font-size: 10px;"></i>`;
                toggle.onclick = (e) => {
                    e.stopPropagation();
                    if (this.collapsedElements.has(element)) this.collapsedElements.delete(element);
                    else this.collapsedElements.add(element);
                    this.renderStructureTree();
                };
            }
            mainRow.appendChild(toggle);

            // 3. Tag Icon
            const tagName = element.tagName.toLowerCase();
            let iconClass = 'fas fa-code';
            if (['div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside'].includes(tagName)) {
                 iconClass = this.collapsedElements.has(element) ? 'fas fa-folder' : 'fas fa-folder-open';
            }
            if (tagName === 'img') iconClass = 'far fa-image';
            if (['p', 'span', 'a'].includes(tagName) || tagName.startsWith('h')) iconClass = 'fas fa-font';
            if (tagName === 'button') iconClass = 'fas fa-toggle-on';
            if (['input', 'textarea', 'select'].includes(tagName)) iconClass = 'fas fa-keyboard';
            if (tagName === 'form') iconClass = 'fab fa-wpforms';

            const icon = document.createElement('i');
            icon.className = iconClass;
            icon.style.marginRight = '8px';
            icon.style.width = '16px';
            icon.style.textAlign = 'center';
            icon.style.color = '#dcb67a';
            mainRow.appendChild(icon);

            // 4. Tag Name Label
            const tagNameSpan = document.createElement('span');
            tagNameSpan.innerText = tagName;
            tagNameSpan.style.color = '#569cd6';
            tagNameSpan.style.fontSize = '12px';
            tagNameSpan.style.fontFamily = 'Consolas, monospace';
            mainRow.appendChild(tagNameSpan);

            // 5. Brief Info Preview (ID/Class)
            const info = document.createElement('span');
            info.style.color = 'rgba(255,255,255,0.2)';
            info.style.fontSize = '10px';
            info.style.marginLeft = '8px';
            info.style.whiteSpace = 'nowrap';
            info.style.overflow = 'hidden';
            info.style.textOverflow = 'ellipsis';
            let infoText = '';
            if (element.id) infoText += '#' + element.id;
            if (element.className) {
                const cls = element.className.replace('selected', '').replace('dropped-element', '').trim();
                if (cls) infoText += ' .' + cls.split(' ').join('.');
            }
            info.innerText = infoText;
            mainRow.appendChild(info);

            // 6. Right Handle (Drawer Toggle)
            const rightHandle = document.createElement('div');
            rightHandle.className = 'right-handle';
            rightHandle.style.marginLeft = 'auto';
            rightHandle.innerHTML = '<i class="fas fa-chevron-left"></i>';
            rightHandle.onclick = (e) => {
                e.stopPropagation();
                item.classList.toggle('drawer-open');
            };
            mainRow.appendChild(rightHandle);

            item.appendChild(mainRow);

            // Hidden Drawer for Quick Edits
            const drawer = document.createElement('div');
            drawer.className = 'item-drawer';

            const idInp = document.createElement('input');
            idInp.className = 'drawer-input';
            idInp.placeholder = '#id';
            idInp.value = element.id || '';
            idInp.onclick = e => e.stopPropagation();
            idInp.onchange = (e) => {
                element.id = e.target.value;
                this.updateCode();
                this.saveState();
                this.renderStructureTree();
            };
            drawer.appendChild(idInp);

            const classInp = document.createElement('input');
            classInp.className = 'drawer-input';
            classInp.placeholder = '.class';
            classInp.value = element.className.replace('selected', '').replace('dropped-element', '').trim();
            classInp.onclick = e => e.stopPropagation();
            classInp.onchange = (e) => {
                const internal = 'dropped-element' + (Builder.selectedElements.includes(element) ? ' selected' : '');
                element.className = e.target.value ? (e.target.value + ' ' + internal) : internal;
                this.updateCode();
                this.saveState();
                this.renderStructureTree();
            };
            drawer.appendChild(classInp);

            const tagSel = document.createElement('select');
            tagSel.className = 'drawer-input';
            ['div', 'section', 'article', 'aside', 'main', 'header', 'footer', 'nav', 'span', 'p', 'h1', 'h2', 'h3'].forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.innerText = t;
                if (tagName === t) opt.selected = true;
                tagSel.appendChild(opt);
            });
            tagSel.onclick = e => e.stopPropagation();
            tagSel.onchange = (e) => {
                const newTag = e.target.value;
                if (newTag !== tagName) {
                    const newEl = document.createElement(newTag);
                    while (element.firstChild) newEl.appendChild(element.firstChild);
                    Array.from(element.attributes).forEach(attr => newEl.setAttribute(attr.name, attr.value));
                    element.parentNode.replaceChild(newEl, element);
                    Builder.selectElement(newEl);
                    this.updateCode();
                    this.saveState();
                    this.renderStructureTree();
                }
            };
            drawer.appendChild(tagSel);

            const delBtn = document.createElement('button');
            delBtn.className = 'drawer-input';
            delBtn.style.width = '30px';
            delBtn.style.color = '#ff4444';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                this.showSmartDeleteModal(element);
            };
            drawer.appendChild(delBtn);

            item.appendChild(drawer);


            // Events
            item.onmouseover = (e) => {
                e.stopPropagation();
                Builder.highlightDropTarget(element);
            };
            item.onmouseout = (e) => {
                e.stopPropagation();
                Builder.removeHighlight(element);
            };
            item.onclick = (e) => {
                e.stopPropagation();
                const multi = e.ctrlKey || e.metaKey;
                Builder.selectElement(element, multi);
                this.renderStructureTree();
            };
            item.ondblclick = (e) => {
                e.stopPropagation();
                this.editStructureItem(element);
            };

            // --- Drag & Drop Reordering ---

            item.ondragstart = (e) => {
                e.stopPropagation();
                this.draggingElement = element;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'structure-item');
                // Use a timeout to hide the element slightly after drag starts (optional visual)
                setTimeout(() => item.style.opacity = '0.5', 0);
            };

            item.ondragend = (e) => {
                item.style.opacity = '1';
                this.draggingElement = null;
                this.dropPosition = null;
                // Clear any leftover styles on items
                const items = document.querySelectorAll('.structure-item');
                items.forEach(i => {
                    i.style.borderTop = '';
                    i.style.borderBottom = '';
                    // Background handled by CSS
                    // Reset borders
                    i.style.borderBottom = '1px solid var(--border-color)';
                    if (i.dataset.selected === 'true') i.style.borderLeft = '3px solid #00ff00';
                    else i.style.borderLeft = '3px solid transparent';
                });
            };

            item.ondragover = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';

                // If dragging a new component (not existing element)
                if (!this.draggingElement) {
                    // Logic for new components: usually append inside
                    item.style.border = '2px dashed #007acc';
                    return;
                }

                // Don't allow dropping on self or children (prevent infinite loops)
                if (this.draggingElement === element || this.draggingElement.contains(element)) {
                    return;
                }

                const rect = item.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const height = rect.height;
                const isContainer = Builder.isContainer(element);

                // Reset styles
                item.style.borderTop = '';
                item.style.borderBottom = '1px solid var(--border-color)';
                if (!Builder.selectedElements.includes(element)) item.style.backgroundColor = 'transparent';

                // Determine Zone
                // Top 25%: Before
                // Bottom 25%: After
                // Middle 50%: Inside (if container)

                if (y < height * 0.25) {
                    this.dropPosition = 'before';
                    item.style.borderTop = '2px solid #007acc';
                } else if (y > height * 0.75) {
                    this.dropPosition = 'after';
                    item.style.borderBottom = '2px solid #007acc';
                } else {
                    if (isContainer) {
                        this.dropPosition = 'inside';
                        item.style.backgroundColor = 'rgba(0, 122, 204, 0.2)';
                        item.style.border = '1px dashed #007acc';
                    } else {
                        // Fallback for non-containers in middle -> treat as after
                        this.dropPosition = 'after';
                        item.style.borderBottom = '2px solid #007acc';
                    }
                }
            };

            item.ondragleave = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Reset visual feedback
                item.style.borderTop = '';
                item.style.borderBottom = '1px solid var(--border-color)';
                item.style.border = 'none';
                item.style.borderBottom = '1px solid var(--border-color)';
                if (Builder.selectedElements.includes(element)) {
                    item.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
                    item.style.borderLeft = '3px solid #00ff00';
                } else {
                    item.style.backgroundColor = 'transparent';
                    item.style.borderLeft = '3px solid transparent';
                }
            };

            item.ondrop = (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Handle File Drop
                const fileData = e.dataTransfer.getData('application/x-visual-ui-file');
                if (fileData) {
                    this.handleFileDrop(JSON.parse(fileData), element);
                    return;
                }

                // Handle New Component Drop
                const type = e.dataTransfer.getData('text/plain');
                if (!this.draggingElement && type && !type.includes('{') && type !== 'structure-item') {
                    Builder.createElement(type, element);
                    this.saveState();
                    this.updateCode();
                    this.renderStructureTree();
                    return;
                }

                // Handle Reordering
                if (this.draggingElement && this.dropPosition) {
                    // Safety check
                    if (this.draggingElement === element || this.draggingElement.contains(element)) return;

                    const parent = element.parentNode;

                    try {
                        if (this.dropPosition === 'before') {
                            parent.insertBefore(this.draggingElement, element);
                        } else if (this.dropPosition === 'after') {
                            parent.insertBefore(this.draggingElement, element.nextSibling);
                        } else if (this.dropPosition === 'inside') {
                            element.appendChild(this.draggingElement);
                            // Auto-expand if dropped inside
                            this.collapsedElements.delete(element);
                        }

                        this.saveState();
                        this.updateCode();
                        Builder.selectElement(this.draggingElement); // Keep selection
                        this.renderStructureTree();
                    } catch (err) {
                        console.error('Move failed:', err);
                    }
                }

                this.draggingElement = null;
                this.dropPosition = null;
            };

            container.appendChild(item);

            // Children
            if (!this.collapsedElements.has(element)) {
                Array.from(element.children).forEach(child => buildTree(child, depth + 1));
            }
        };

        buildTree(root);
    },

    loadStructureFromFile: function(path) {
        if (!path) return;
        // Just open the file, it will load into builder
        this.openFile(path);
    },

    populateStructureFileSelect: function() {
        const select = document.getElementById('structure-file-select');
        if (!select || !this.currentProjectPath) return;

        // Fetch all HTML files recursively
        fetch('/api/list_files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: this.currentProjectPath, recursive: true })
        })
        .then(res => res.json())
        .then(data => {
            if (data.items) {
                const htmlFiles = data.items.filter(f => f.name.endsWith('.html'));
                // Preserve current selection if possible
                const currentVal = this.currentFilePath || select.value;

                select.innerHTML = '<option value="">Select File...</option>';
                htmlFiles.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.path;
                    // Show relative path for clarity if in subfolder
                    const relPath = f.path.replace(this.currentProjectPath.replace(/\\/g, '/') + '/', '');
                    opt.innerText = relPath; // Show relative path
                    if (f.path === currentVal) opt.selected = true;
                    select.appendChild(opt);
                });
            }
        });
    },

    exportSelectedElements: function() {
        if (Builder.selectedElements.length === 0) {
            alert('No elements selected to export.');
            return;
        }

        let exportHTML = '';
        Builder.selectedElements.forEach(el => {
             // Clone to remove internal classes
             const clone = el.cloneNode(true);
             const clean = (node) => {
                 if (node.classList) {
                     node.classList.remove('dropped-element', 'selected');
                     if (node.classList.length === 0) node.removeAttribute('class');
                     node.style.outline = '';
                 }
                 Array.from(node.children).forEach(clean);
             };
             clean(clone);
             exportHTML += clone.outerHTML + '\n';
        });

        // Copy to clipboard
        navigator.clipboard.writeText(exportHTML).then(() => {
            this.logConsole('Selected elements copied to clipboard!', 'success');
            alert('Selected HTML copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback
            prompt('Copy your HTML:', exportHTML);
        });
    },

    editStructureItem: function(element) {
        let updates = {};

        const applyChanges = () => {
            let changed = false;

            if (updates.id !== undefined) {
                element.id = updates.id;
                changed = true;
            }

            if (updates.className !== undefined) {
                const internal = 'dropped-element' + (Builder.selectedElements.includes(element) ? ' selected' : '');
                element.className = updates.className ? (updates.className + ' ' + internal) : internal;
                changed = true;
            }

            if (updates.innerText !== undefined) {
                // Safety check: don't wipe children if not intended
                if (element.children.length === 0 || confirm('This element has children. Overwriting text will remove them. Continue?')) {
                    element.innerText = updates.innerText;
                    changed = true;
                }
            }

            if (updates.src !== undefined && element.tagName === 'IMG') {
                element.setAttribute('src', updates.src);
                changed = true;
            }

            if (changed) {
                this.saveState();
                this.updatePropertyInspector(element);
                this.renderStructureTree();
                this.updateCode();
            }
        };

        this.showModal({
            title: 'Edit Element',
            message: 'Loading properties...',
            showInput: false,
            onOk: () => {
                applyChanges();
            }
        });

        // Inject Custom Form
        setTimeout(() => {
            const msgEl = document.getElementById('generic-modal-message');
            if (!msgEl) return;

            msgEl.innerHTML = '';

            const form = document.createElement('div');
            form.style.display = 'flex';
            form.style.flexDirection = 'column';
            form.style.gap = '10px';

            const addInput = (label, value, onChange) => {
                const row = document.createElement('div');
                row.innerHTML = `<label style="display:block; margin-bottom:4px; font-size:12px; color:#aaa;">${label}</label>`;
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = value;
                inp.className = 'prop-input';
                inp.style.width = '100%';
                inp.onchange = (e) => onChange(e.target.value);
                row.appendChild(inp);
                form.appendChild(row);
            };

            addInput('ID', element.id || '', (v) => updates.id = v);

            const currentClasses = element.className.replace('selected', '').replace('dropped-element', '').trim();
            addInput('Classes', currentClasses, (v) => updates.className = v);

            // Only show content input for elements that usually have text or are empty
            if (!['IMG', 'INPUT', 'BR', 'HR'].includes(element.tagName)) {
                 const hasChildren = element.children.length > 0;
                 const label = hasChildren ? 'Content (Text) - Warning: Has Children' : 'Content (Text)';
                 addInput(label, hasChildren ? '' : element.innerText, (v) => updates.innerText = v);
            }

            if (element.tagName === 'IMG') {
                addInput('Src', element.getAttribute('src') || '', (v) => updates.src = v);
            }

            // Add Apply Button
            const btnRow = document.createElement('div');
            btnRow.style.display = 'flex';
            btnRow.style.justifyContent = 'flex-end';
            btnRow.style.marginTop = '10px';

            const applyBtn = document.createElement('button');
            applyBtn.className = 'btn';
            applyBtn.style.backgroundColor = '#2d2d30';
            applyBtn.style.border = '1px solid #444';
            applyBtn.style.color = '#fff';
            applyBtn.style.cursor = 'pointer';
            applyBtn.innerText = 'Apply Changes';
            applyBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                applyChanges();

                // Visual feedback
                const originalText = applyBtn.innerText;
                applyBtn.innerText = 'Applied!';
                applyBtn.style.borderColor = '#007acc';
                setTimeout(() => {
                    applyBtn.innerText = originalText;
                    applyBtn.style.borderColor = '#444';
                }, 1000);
            };

            btnRow.appendChild(applyBtn);
            form.appendChild(btnRow);

            msgEl.appendChild(form);

            // Hide default input wrapper if visible (should be hidden by showInput:false but just in case)
            const defInput = document.getElementById('generic-modal-input-wrapper');
            if (defInput) defInput.style.display = 'none';

        }, 50);
    },

    setupStructureDnD: function(item, element) {
        item.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            // Store the element reference globally to avoid ID dependency
            App.draggedStructureElement = element;
            e.dataTransfer.effectAllowed = 'move';
            item.style.opacity = '0.5';
        });

        item.addEventListener('dragend', (e) => {
            item.style.opacity = '1';
            document.querySelectorAll('.structure-item').forEach(el => {
                el.style.borderTop = '';
                el.style.borderBottom = '';
                el.style.backgroundColor = ''; // Reset hover
            });
            App.draggedStructureElement = null;
            this.renderStructureTree();
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const rect = item.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const height = rect.height;

            // Reset styles
            item.style.borderTop = '';
            item.style.borderBottom = '';
            item.style.backgroundColor = '#2a2d2e'; // Hover bg

            // Zones: Top 25% (Before), Bottom 25% (After), Middle 50% (Inside)
            if (relY < height * 0.25) {
                item.style.borderTop = '2px solid #007acc';
                e.dataTransfer.dropEffect = 'move';
                item.dataset.dropPos = 'before';
            } else if (relY > height * 0.75) {
                item.style.borderBottom = '2px solid #007acc';
                e.dataTransfer.dropEffect = 'move';
                item.dataset.dropPos = 'after';
            } else {
                item.style.backgroundColor = '#3e3e42'; // Highlight inside
                e.dataTransfer.dropEffect = 'move';
                item.dataset.dropPos = 'inside';
            }
        });

        item.addEventListener('dragleave', (e) => {
             item.style.borderTop = '';
             item.style.borderBottom = '';
             item.style.backgroundColor = '';
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const draggedEl = App.draggedStructureElement;

            if (!draggedEl || !element) return;
            if (draggedEl === element) return; // Can't drop on self
            if (draggedEl.contains(element)) return; // Can't drop parent into child

            const pos = item.dataset.dropPos;

            if (pos === 'before') {
                element.parentNode.insertBefore(draggedEl, element);
            } else if (pos === 'after') {
                element.parentNode.insertBefore(draggedEl, element.nextSibling);
            } else if (pos === 'inside') {
                element.appendChild(draggedEl);
            }

            this.saveState();
            this.renderStructureTree();
            // Also sync code
            this.updateCode();
        });
    },

    handleFileDrop: function(file, target) {
        if (!file || file.type === 'dir') return;

        let relPath = file.name; // Default to name
        if (this.currentProjectPath && file.path.startsWith(this.currentProjectPath)) {
            // Simple relative path (assumes file is in project)
            // Ideally should be relative to current HTML file location
            relPath = file.path.substring(this.currentProjectPath.length + 1).replace(/\\/g, '/');
        }

        if (file.name.endsWith('.css')) {
            // Check for existing link
            const existing = document.getElementById('preview-canvas').querySelectorAll('link[rel="stylesheet"]');
            for(let link of existing) {
                if(link.getAttribute('href') === relPath) {
                    this.logConsole('CSS already linked: ' + relPath, 'info');
                    return;
                }
            }

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = relPath;
            // Append to canvas root (simulating head/body)
            document.getElementById('preview-canvas').appendChild(link);
            this.logConsole(`Linked CSS: ${relPath}`, 'success');
        } else if (file.name.endsWith('.js')) {
            const script = document.createElement('script');
            script.src = relPath;
            target.appendChild(script);
            this.logConsole(`Linked JS: ${relPath}`, 'success');
        } else if (file.name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
            if (target.tagName === 'IMG') {
                target.src = relPath;
                this.logConsole(`Updated Image Source: ${relPath}`, 'success');
            } else {
                const img = document.createElement('img');
                img.src = relPath;
                img.alt = file.name;
                img.classList.add('dropped-element');
                target.appendChild(img);
                Builder.selectElement(img);
                this.logConsole(`Added Image: ${relPath}`, 'success');
            }
        }

        this.saveState();
        this.updateCode();
        this.renderStructureTree();
    },

    refreshFileTree: function() {
        // Get path from localStorage or default
        // We set this in startNewProject (need to update that too)
        // For now, let's assume we have it or ask user
        let path = localStorage.getItem('vuc_project_path');
        if (!path) {
            path = '~/projects'; // Default root
        }

        const container = document.getElementById('file-tree');
        if (!container) return;

        container.innerHTML = '<div style="color:#888; padding:5px;">Loading...</div>';

        this.fetchFiles(path, container);

        // Update Structure File Selector
        if (path && path !== '~/projects') {
             this.currentProjectPath = path;
             this.populateStructureFileSelect();
        }
    },

    fetchFiles: function(path, container) {
        fetch('/api/list_files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                container.innerHTML = `<div style="color:red; padding:5px;">Error: ${data.error}</div>`;
                return;
            }
            this.renderFileItems(data.items, container);
        })
        .catch(err => {
            container.innerHTML = `<div style="color:red; padding:5px;">Connection Error</div>`;
        });
    },

    deleteFile: function(path) {
        if (!confirm(`Are you sure you want to delete ${path}?`)) return;

        fetch('/api/delete_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) this.logConsole('Error deleting file: ' + data.error, 'error');
            else {
                this.logConsole(`Deleted ${path}`, 'success');
                this.refreshFileTree();
            }
        });
    },

    renameFile: function(oldPath) {
        const newName = prompt('Enter new name:', oldPath.split(/[/\\]/).pop());
        if (!newName) return;

        // Construct new path
        const sep = oldPath.includes('\\') ? '\\' : '/';
        const parts = oldPath.split(sep);
        parts.pop();
        const newPath = parts.join(sep) + sep + newName;

        fetch('/api/rename_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_path: oldPath, new_path: newPath })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) this.logConsole('Error renaming file: ' + data.error, 'error');
            else {
                this.logConsole(`Renamed to ${newName}`, 'success');
                this.refreshFileTree();
            }
        });
    },

    renderFileItems: function(items, container) {
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<div style="color:#666; font-style:italic; padding:5px;">Empty directory</div>';
            return;
        }

        const list = document.createElement('ul');

        items.forEach(item => {
            const li = document.createElement('li');
            li.style.margin = '0';

            const row = document.createElement('div');
            row.className = 'file-row';

            // Drag & Drop Support
            row.draggable = true;
            row.ondragstart = (e) => {
                e.stopPropagation();
                e.dataTransfer.setData('application/x-visual-ui-file', JSON.stringify({
                    path: item.path,
                    name: item.name,
                    type: item.type
                }));
                e.dataTransfer.setData('text/plain', item.name);
                e.dataTransfer.effectAllowed = 'copy';
                row.style.opacity = '0.5';
            };
            row.ondragend = (e) => {
                row.style.opacity = '1';
            };

            // Icon Logic
            const icon = document.createElement('i');
            if (item.type === 'dir') {
                icon.className = 'fas fa-folder';
            } else {
                if (item.name.endsWith('.html')) { icon.className = 'fab fa-html5 file-icon html'; }
                else if (item.name.endsWith('.css')) { icon.className = 'fab fa-css3-alt file-icon css'; }
                else if (item.name.endsWith('.js')) { icon.className = 'fab fa-js file-icon js'; }
                else if (item.name.endsWith('.ts')) { icon.className = 'fas fa-file-code file-icon ts'; }
                else if (item.name.endsWith('.json')) { icon.className = 'fas fa-file-code file-icon json'; }
                else if (item.name.endsWith('.py')) { icon.className = 'fab fa-python file-icon py'; }
                else if (item.name.match(/\.(jpg|jpeg|png|gif|svg)$/i)) { icon.className = 'fas fa-image file-icon img'; }
                else { icon.className = 'fas fa-file file-icon'; }
            }

            const label = document.createElement('span');
            label.innerText = item.name;

            row.appendChild(icon);
            row.appendChild(label);

            // Row Actions (New File/Folder, Rename, Delete)
            const actions = document.createElement('div');
            actions.className = 'row-actions';

            if (item.type === 'dir') {
                 const addFileBtn = document.createElement('i');
                 addFileBtn.className = 'fas fa-file-circle-plus';
                 addFileBtn.title = 'New File';
                 addFileBtn.onclick = (e) => { e.stopPropagation(); this.createNewFile(item.path); };

                 const addFolderBtn = document.createElement('i');
                 addFolderBtn.className = 'fas fa-folder-plus';
                 addFolderBtn.title = 'New Folder';
                 addFolderBtn.onclick = (e) => { e.stopPropagation(); this.createNewFolder(item.path); };

                 actions.appendChild(addFileBtn);
                 actions.appendChild(addFolderBtn);
            }

            const renameBtn = document.createElement('i');
            renameBtn.className = 'fas fa-pencil-alt';
            renameBtn.title = 'Rename';
            renameBtn.onclick = (e) => { e.stopPropagation(); this.renameFile(item.path); };

            const deleteBtn = document.createElement('i');
            deleteBtn.className = 'fas fa-trash-alt';
            deleteBtn.title = 'Delete';
            deleteBtn.style.color = '#cc6666';
            deleteBtn.onclick = (e) => { e.stopPropagation(); this.deleteFile(item.path); };

            actions.appendChild(renameBtn);
            actions.appendChild(deleteBtn);

            row.appendChild(actions);

            li.appendChild(row);

            if (item.type === 'dir') {
                // Container for children
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'sub-tree';

                // Check expanded state
                if (this.expandedPaths.has(item.path)) {
                    childrenContainer.style.display = 'block';
                    icon.className = 'fas fa-folder-open';
                    // Auto-fetch children
                    this.fetchFiles(item.path, childrenContainer);
                } else {
                    childrenContainer.style.display = 'none';
                }

                li.appendChild(childrenContainer);

                row.onclick = (e) => {
                    e.stopPropagation();
                    // Toggle Selection
                    document.querySelectorAll('.file-row').forEach(r => r.classList.remove('selected'));
                    row.classList.add('selected');

                    if (childrenContainer.style.display === 'none') {
                        childrenContainer.style.display = 'block';
                        icon.className = 'fas fa-folder-open';
                        this.expandedPaths.add(item.path); // Remember expanded
                        this.saveExpandedPaths();

                        // Fetch if empty
                        if (childrenContainer.children.length === 0) {
                            childrenContainer.innerHTML = '<div style="padding-left:20px; color:#666;">Loading...</div>';
                            this.fetchFiles(item.path, childrenContainer);
                        }
                    } else {
                        childrenContainer.style.display = 'none';
                        icon.className = 'fas fa-folder';
                        this.expandedPaths.delete(item.path); // Forget expanded
                        this.saveExpandedPaths();
                    }
                };
            } else {
                // File Click
                row.onclick = (e) => {
                    e.stopPropagation();
                    // Toggle Selection
                    document.querySelectorAll('.file-row').forEach(r => r.classList.remove('selected'));
                    row.classList.add('selected');

                    this.openFile(item.path);
                };
            }

            list.appendChild(li);
        });

        container.appendChild(list);
    },

    saveExpandedPaths: function() {
        localStorage.setItem('vuc_expanded_paths', JSON.stringify(Array.from(this.expandedPaths)));
    },

    openFile: function(path) {
        this.currentFilePath = path;

        // Update Selector if exists
        const select = document.getElementById('structure-file-select');
        if (select) {
            select.value = path;
        }

        fetch('/api/read_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                this.logConsole('Error opening file: ' + data.error, 'error');
                return;
            }

            // Determine type
            const ext = path.split('.').pop().toLowerCase();

            if (ext === 'html') {
                if (window.monacoEditor) {
                    window.monacoEditor.setValue(data.content);
                    // Sync to Visual Builder
                    Builder.loadHTML(data.content);
                    this.renderStructureTree();

                    // Switch to Structure Tree Tab
                    this.switchSidebar('structure');
                }
                this.logConsole(`Opened ${path}`, 'success');
            } else if (ext === 'css') {
                  this.currentCSSPath = path; // Track active CSS file
                  this.currentCSSContent = data.content; // Store content
                  if (window.monacoEditor) {
                      window.monacoEditor.setValue(data.content);
                      monaco.editor.setModelLanguage(window.monacoEditor.getModel(), 'css');

                      // Inject styles
                      let styleTag = document.getElementById('custom-css');
                      if (!styleTag) {
                          styleTag = document.createElement('style');
                          styleTag.id = 'custom-css';
                          document.head.appendChild(styleTag);
                      }
                      styleTag.textContent = data.content;

                      this.switchSidebar('css');
                  }
                  this.logConsole(`Opened CSS file ${path}`, 'success');
             } else if (ext === 'js' || ext === 'ts') {
                 if (window.scriptEditor) {
                     window.scriptEditor.setValue(data.content);
                     this.switchBottomPanel('script'); // Switch to Script Editor Panel
                     this.logConsole(`Opened ${path}`, 'success');
                 }
            } else {
                 this.logConsole(`Opened ${path} (Read-only)`, 'info');
            }
        });
    },

    loadAssets: async function() {
        const list = document.getElementById('asset-list');
        list.innerHTML = '<div style="color:#888; text-align:center;">Loading...</div>';

        try {
            const res = await fetch('/api/assets');
            if (!res.ok) throw new Error('Failed to fetch assets');

            const files = await res.json();

            // Folder System Logic (Visual Simulation)
            const folderMap = JSON.parse(localStorage.getItem('vuc_asset_folders') || '{}'); // filename -> folderName
            const folders = JSON.parse(localStorage.getItem('vuc_folders_list') || '["Images", "Icons", "Docs"]');

            list.innerHTML = '';
            list.style.display = 'block'; // Reset from grid

            // 1. Render Folders
            folders.forEach(folder => {
                const folderEl = document.createElement('div');
                folderEl.className = 'asset-folder';
                folderEl.innerHTML = `
                    <div class="folder-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                        <i class="fas fa-folder"></i> <span>${folder}</span> <i class="fas fa-chevron-down" style="font-size:0.7em; margin-left:auto;"></i>
                    </div>
                    <div class="folder-content hidden" data-folder="${folder}"></div>
                `;

                // Allow dropping into folder
                folderEl.ondragover = (e) => { e.preventDefault(); folderEl.classList.add('drag-over'); };
                folderEl.ondragleave = () => folderEl.classList.remove('drag-over');
                folderEl.ondrop = (e) => {
                    e.preventDefault();
                    folderEl.classList.remove('drag-over');
                    const fileName = e.dataTransfer.getData('text/plain');
                    if (fileName) {
                        folderMap[fileName] = folder;
                        localStorage.setItem('vuc_asset_folders', JSON.stringify(folderMap));
                        this.loadAssets(); // Reload to update view
                    }
                };

                list.appendChild(folderEl);
            });

            // 2. Render Files
            const uncategorizedEl = document.createElement('div');
            uncategorizedEl.className = 'asset-grid';
            uncategorizedEl.style.padding = '10px 0';

            if (files.length === 0) {
                uncategorizedEl.innerHTML = '<div style="color:#888; text-align:center; width:100%;">No assets found</div>';
            }

            files.forEach(f => {
                const item = document.createElement('div');
                item.className = 'asset-item';
                item.draggable = true;
                item.ondragstart = (e) => {
                    e.dataTransfer.setData('text/plain', f.name);
                };

                item.innerHTML = `
                    <div class="asset-preview" style="background-image:url('${f.url}')"></div>
                    <div class="asset-name" title="${f.name}">${f.name}</div>
                `;

                item.onclick = () => {
                    const selected = Builder.selectedElement;
                    if (selected && selected.tagName === 'IMG') {
                        selected.src = f.url;
                        App.saveState();
                        App.updatePropertyInspector(selected);
                    } else {
                        navigator.clipboard.writeText(f.url);
                        App.showModal({ title: 'Success', message: 'Asset URL copied to clipboard!' });
                    }
                };

                // Place in folder or uncategorized
                const folderName = folderMap[f.name];
                if (folderName && folders.includes(folderName)) {
                    const folderContent = list.querySelector(`.folder-content[data-folder="${folderName}"]`);
                    if (folderContent) {
                        // Ensure grid layout in folder
                        if (!folderContent.classList.contains('asset-grid')) folderContent.classList.add('asset-grid');
                        folderContent.appendChild(item);
                        return;
                    }
                }

                uncategorizedEl.appendChild(item);
            });

            // Append uncategorized section if it has items
            if (uncategorizedEl.children.length > 0) {
                const header = document.createElement('div');
                header.className = 'category-header';
                header.innerText = 'Uncategorized';
                list.appendChild(header);
                list.appendChild(uncategorizedEl);
            }

        } catch (err) {
            console.error('Asset load error:', err);
            list.innerHTML = `<div style="color:red; text-align:center;">Error: ${err.message}</div>`;
        }
    },

    createAssetFolder: function() {
        this.showModal({
            title: 'New Folder',
            message: 'Enter folder name:',
            showInput: true,
            onOk: (name) => {
                if (name) {
                    const folders = JSON.parse(localStorage.getItem('vuc_folders_list') || '["Images", "Icons", "Docs"]');
                    if (!folders.includes(name)) {
                        folders.push(name);
                        localStorage.setItem('vuc_folders_list', JSON.stringify(folders));
                        this.loadAssets();
                    }
                }
            }
        });
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

        // Project Upload Input
        const projectUpload = document.getElementById('project-upload');
        if (projectUpload) {
            projectUpload.addEventListener('change', (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;

                // Simple heuristic to find main files
                let htmlFile, cssFile, jsFile;

                Array.from(files).forEach(f => {
                    const name = f.name.toLowerCase();
                    if (name.endsWith('.html') && (name.includes('index') || !htmlFile)) htmlFile = f;
                    if (name.endsWith('.css') && (name.includes('style') || !cssFile)) cssFile = f;
                    if ((name.endsWith('.js') || name.endsWith('.ts')) && (name.includes('script') || name.includes('main') || !jsFile)) jsFile = f;
                });

                if (htmlFile) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const content = ev.target.result;
                        // Strip html/body tags for the canvas if needed, or replace fully
                        // Current logic mostly assumes inner body content for canvas,
                        // but let's try to load it into Monaco which syncs to canvas.
                        if (window.monacoEditor) {
                            window.monacoEditor.setValue(content);
                            // Trigger sync
                            this.syncCodeToCanvas();
                        }
                    };
                    reader.readAsText(htmlFile);
                }

                if (cssFile) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                         // We assume we have a way to set CSS.
                         // Currently CSS is handled via style tags or the CSS tab in sidebar.
                         // Let's look for a CSS editor or store it.
                         // For now, let's inject it into the page or finding the CSS editor.
                         // Checking switchSidebar('css'), it shows #sidebar-content-css.
                         // We might need a Monaco instance for CSS too, but usually it's a textarea in this app?
                         // Let's check `updateCodeView` or similar.
                         // Assuming there is a CSS editor textarea or Monaco model.
                         // If not, we might need to add one or just alert the user.
                         // Actually, looking at previous reads, there is a `code-editor` textarea which syncs.
                         // But that's for HTML.
                         // Let's just log for now or put it in a style block if we can.
                         const cssContent = ev.target.result;
                         // Store it for export? Or try to put it in a <style id="custom-css">
                         let styleTag = document.getElementById('custom-css');
                         if (!styleTag) {
                             styleTag = document.createElement('style');
                             styleTag.id = 'custom-css';
                             document.head.appendChild(styleTag);
                         }
                         styleTag.textContent = cssContent;
                         this.logConsole('Loaded CSS file: ' + cssFile.name, 'success');
                    };
                    reader.readAsText(cssFile);
                }

                if (jsFile) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (window.scriptEditor) {
                            window.scriptEditor.setValue(ev.target.result);
                            this.logConsole('Loaded JS file: ' + jsFile.name, 'success');
                        }
                    };
                    reader.readAsText(jsFile);
                }

                this.logConsole(`Opened project with ${files.length} files.`, 'info');
            });
        }

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

            // Home: Ctrl+H
            if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
                e.preventDefault();
                this.goHome();
            }
            // Timeline: Ctrl+T
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                this.toggleTimelinePanel();
            }

            // Custom Shortcuts
            if (e.altKey) {
                if (e.key === 'a') { e.preventDefault(); this.switchSidebar('html'); } // Add/Components
                if (e.key === '1' || e.key === 'h') { e.preventDefault(); this.switchSidebar('html'); }
                if (e.key === '2' || e.key === 'c') { e.preventDefault(); this.switchSidebar('css'); }
                if (e.key === '3' || e.key === 'j') { e.preventDefault(); this.switchSidebar('js'); }
            }

            // Select All: Ctrl+A
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                // Allow default behavior in inputs/textareas
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                e.preventDefault();
                if (Builder) Builder.selectAll();
            }

            // Deselect: Esc
            if (e.key === 'Escape') {
                e.preventDefault();
                if (Builder) Builder.deselectAll();
                // Also close modals if open
                this.closeModal();
                this.closeColorStudio();
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

    createCornerMapper: function(el) {
        const container = document.createElement('div');
        container.className = 'corner-mapper-container';

        const icon = document.createElement('div');
        icon.className = 'corner-mapper-icon';

        let isLinked = true;
        const linkBtn = document.createElement('div');
        linkBtn.className = 'corner-link-btn active';
        linkBtn.innerHTML = '<i class="fas fa-link"></i>';
        linkBtn.onclick = () => {
            isLinked = !isLinked;
            linkBtn.classList.toggle('active', isLinked);
            linkBtn.innerHTML = isLinked ? '<i class="fas fa-link"></i>' : '<i class="fas fa-unlink"></i>';
        };
        icon.appendChild(linkBtn);

        const corners = ['tl', 'tr', 'bl', 'br'];
        const handles = {};

        // Parse existing radius
        const currentRadius = this.getStyle('borderRadius') || '0px';
        const radiusParts = currentRadius.split(' ').map(p => parseInt(p) || 0);
        // [tl, tr, br, bl] - CSS order is slightly different
        const vals = {
            tl: radiusParts[0] || 0,
            tr: radiusParts[1] || (radiusParts[0] || 0),
            br: radiusParts[2] || (radiusParts[0] || 0),
            bl: radiusParts[3] || (radiusParts[1] || (radiusParts[0] || 0))
        };

        const updateRadius = () => {
            const tl = handles.tl.dataset.value || 0;
            const tr = handles.tr.dataset.value || 0;
            const br = handles.br.dataset.value || 0;
            const bl = handles.bl.dataset.value || 0;

            const value = `${tl}px ${tr}px ${br}px ${bl}px`;
            el.style.borderRadius = value;
            icon.style.borderRadius = value;
        };

        corners.forEach(c => {
            const handle = document.createElement('div');
            handle.className = `corner-handle ${c}`;
            handle.dataset.value = vals[c];
            handles[c] = handle;

            handle.onpointerdown = (e) => {
                e.stopPropagation();
                handle.setPointerCapture(e.pointerId);
                const startX = e.clientX;
                const startY = e.clientY;
                const startVal = parseInt(handle.dataset.value);

                const moveHandler = (me) => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;
                    let delta = 0;
                    if (c === 'tl') delta = (dx + dy) / 2;
                    else if (c === 'tr') delta = (-dx + dy) / 2;
                    else if (c === 'bl') delta = (dx - dy) / 2;
                    else if (c === 'br') delta = (-dx - dy) / 2;

                    let newVal = Math.max(0, Math.round(startVal + delta));

                    if (isLinked) {
                        corners.forEach(corner => {
                            handles[corner].dataset.value = newVal;
                        });
                    } else {
                        handle.dataset.value = newVal;
                    }
                    updateRadius();
                };

                const upHandler = () => {
                    handle.releasePointerCapture(e.pointerId);
                    handle.removeEventListener('pointermove', moveHandler);
                    handle.removeEventListener('pointerup', upHandler);
                    this.applyStyle('borderRadius', icon.style.borderRadius);
                    this.updateCode();
                };

                handle.addEventListener('pointermove', moveHandler);
                handle.addEventListener('pointerup', upHandler);
            };
            icon.appendChild(handle);
        });

        container.appendChild(icon);
        updateRadius();
        return container;
    },

    createGradientSlider: function(el) {
        const container = document.createElement('div');
        container.className = 'gradient-slider-container';

        const track = document.createElement('div');
        track.className = 'gradient-track';

        let stops = [
            { pos: 0, color: '#000000' },
            { pos: 100, color: '#ffffff' }
        ];

        // Try to parse existing
        const currentBg = this.getStyle('backgroundImage');
        if (currentBg && currentBg.includes('linear-gradient')) {
             // Extract all color stops using regex that handles rgba, hex, and named colors
             const stopRegex = /(?:rgba?\(.*?\)|#[a-fA-F0-9]{3,8}|[a-z]+)\s*(?:\d+%)?/gi;
             const matches = currentBg.match(stopRegex);
             if (matches && matches.length > 1) {
                 stops = matches.map((match, i) => {
                     const parts = match.trim().split(/\s+(?=\d+%)/);
                     const color = parts[0];
                     let pos = parts[1] ? parseInt(parts[1]) : (i === 0 ? 0 : (i === matches.length - 1 ? 100 : Math.round(i * (100 / (matches.length - 1)))));
                     return { color, pos };
                 });
             }
        }

        const updateGradient = () => {
            stops.sort((a, b) => a.pos - b.pos);
            const gradientStr = `linear-gradient(to right, ${stops.map(s => `${s.color} ${s.pos}%`).join(', ')})`;
            track.style.background = gradientStr;
            el.style.backgroundImage = gradientStr;
        };

        const renderStops = () => {
            Array.from(track.querySelectorAll('.gradient-stop')).forEach(s => s.remove());
            stops.forEach((stop, index) => {
                const stopEl = document.createElement('div');
                stopEl.className = 'gradient-stop';
                stopEl.style.left = stop.pos + '%';
                stopEl.style.backgroundColor = stop.color;

                stopEl.onpointerdown = (e) => {
                    e.stopPropagation();
                    stopEl.setPointerCapture(e.pointerId);
                    const moveHandler = (me) => {
                        const rect = track.getBoundingClientRect();
                        let pos = Math.round(((me.clientX - rect.left) / rect.width) * 100);
                        stop.pos = Math.max(0, Math.min(100, pos));
                        stopEl.style.left = stop.pos + '%';
                        updateGradient();
                    };
                    const upHandler = () => {
                        stopEl.releasePointerCapture(e.pointerId);
                        stopEl.removeEventListener('pointermove', moveHandler);
                        stopEl.removeEventListener('pointerup', upHandler);
                        this.applyStyle('backgroundImage', track.style.background);
                        this.updateCode();
                    };
                    stopEl.addEventListener('pointermove', moveHandler);
                    stopEl.addEventListener('pointerup', upHandler);
                };

                let lastTap = 0;
                stopEl.addEventListener('pointerdown', (e) => {
                    const now = Date.now();
                    if (now - lastTap < 300) {
                        // Double tap / double click
                        const color = prompt('Enter color:', stop.color);
                        if (color) {
                            stop.color = color;
                            stopEl.style.backgroundColor = color;
                            updateGradient();
                            this.applyStyle('backgroundImage', track.style.background);
                            this.updateCode();
                        }
                    }
                    lastTap = now;
                });

                track.appendChild(stopEl);
            });
        };

        track.onpointerdown = (e) => {
            if (e.target !== track) return;
            const rect = track.getBoundingClientRect();
            const pos = Math.round(((e.clientX - rect.left) / rect.width) * 100);
            stops.push({ pos: pos, color: '#888888' });
            renderStops();
            updateGradient();
            this.applyStyle('backgroundImage', track.style.background);
            this.updateCode();
        };

        container.appendChild(track);
        renderStops();
        updateGradient();
        return container;
    },

    createShadowJoystick: function(el) {
        const container = document.createElement('div');
        container.className = 'joystick-container';

        const box = document.createElement('div');
        box.className = 'joystick-box';

        const thumb = document.createElement('div');
        thumb.className = 'joystick-thumb';
        box.appendChild(thumb);

        // Parse current shadow
        const currentShadow = this.getStyle('boxShadow') || '0px 0px 5px 0px rgba(0,0,0,0.5)';
        // Extract pixel values more robustly
        const pxMatches = currentShadow.match(/(-?\d+)px/g);
        let curX = 0, curY = 0, blur = '5px', spread = '0px';
        if (pxMatches) {
            curX = parseInt(pxMatches[0]) || 0;
            curY = parseInt(pxMatches[1]) || 0;
            blur = pxMatches[2] || '5px';
            spread = pxMatches[3] || '0px';
        }

        // Extract color robustly (handles rgba, hex, names)
        // Browsers often put color at the beginning or end.
        // We extract color by removing all pixel measurements.
        const color = currentShadow.replace(/-?\d+px/g, '').trim() || 'rgba(0,0,0,0.5)';

        const updateThumb = (x, y) => {
            // Range is -40 to 40, box is 80x80
            const left = 40 + x;
            const top = 40 + y;
            thumb.style.left = Math.max(0, Math.min(80, left)) + 'px';
            thumb.style.top = Math.max(0, Math.min(80, top)) + 'px';
        };
        updateThumb(curX, curY);

        box.onpointerdown = (e) => {
            box.setPointerCapture(e.pointerId);
            const moveHandler = (me) => {
                const rect = box.getBoundingClientRect();
                let x = Math.round(me.clientX - rect.left - 40);
                let y = Math.round(me.clientY - rect.top - 40);

                x = Math.max(-40, Math.min(40, x));
                y = Math.max(-40, Math.min(40, y));

                updateThumb(x, y);

                const newShadow = `${x}px ${y}px ${blur} ${spread} ${color}`;

                // Live Logic: update CSS Variable for preview
                el.style.setProperty('--shadow-x', x + 'px');
                el.style.setProperty('--shadow-y', y + 'px');

                // Apply directly for preview too
                el.style.boxShadow = newShadow;
            };

            const upHandler = () => {
                box.releasePointerCapture(e.pointerId);
                box.removeEventListener('pointermove', moveHandler);
                box.removeEventListener('pointerup', upHandler);

                // Final Sync to Monaco
                const rect = box.getBoundingClientRect();
                const shadow = el.style.boxShadow;
                this.applyStyle('boxShadow', shadow);
                this.updateCode();
            };

            box.addEventListener('pointermove', moveHandler);
            box.addEventListener('pointerup', upHandler);
            moveHandler(e);
        };

        container.appendChild(box);
        return container;
    },

    createFlexBuilder: function(el) {
        const container = document.createElement('div');
        container.className = 'flex-builder';

        // Helper to create a control row
        const createControl = (label, prop, options) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'flex-control';

            const lbl = document.createElement('label');
            lbl.innerText = label;
            wrapper.appendChild(lbl);

            const btnGroup = document.createElement('div');
            btnGroup.className = 'flex-options';

            const currentVal = this.getStyle(prop);

            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'flex-btn' + (currentVal === opt.value ? ' active' : '');
                btn.title = opt.value;
                btn.innerHTML = opt.icon; // FontAwesome icons

                btn.onclick = () => {
                    this.applyStyle(prop, opt.value);
                    // Update UI
                    Array.from(btnGroup.children).forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                };
                btnGroup.appendChild(btn);
            });

            wrapper.appendChild(btnGroup);
            return wrapper;
        };

        // Flex Direction
        container.appendChild(createControl('Direction', 'flexDirection', [
            { value: 'row', icon: '<i class="fas fa-arrow-right"></i>' },
            { value: 'column', icon: '<i class="fas fa-arrow-down"></i>' },
            { value: 'row-reverse', icon: '<i class="fas fa-arrow-left"></i>' },
            { value: 'column-reverse', icon: '<i class="fas fa-arrow-up"></i>' }
        ]));

        // Justify Content
        container.appendChild(createControl('Justify', 'justifyContent', [
            { value: 'flex-start', icon: '<i class="fas fa-align-left"></i>' },
            { value: 'center', icon: '<i class="fas fa-align-center"></i>' },
            { value: 'flex-end', icon: '<i class="fas fa-align-right"></i>' },
            { value: 'space-between', icon: '<i class="fas fa-arrows-alt-h"></i>' },
            { value: 'space-around', icon: '<i class="fas fa-compress-arrows-alt"></i>' }
        ]));

        // Align Items
        container.appendChild(createControl('Align', 'alignItems', [
            { value: 'stretch', icon: '<i class="fas fa-expand-alt"></i>' },
            { value: 'flex-start', icon: '<i class="fas fa-arrow-up"></i>' },
            { value: 'center', icon: '<i class="fas fa-align-center" style="transform:rotate(90deg)"></i>' },
            { value: 'flex-end', icon: '<i class="fas fa-arrow-down"></i>' }
        ]));

        // Wrap & Gap
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.marginBottom = '8px';

        const currentWrap = this.getStyle('flexWrap');

        // Wrap Toggle
        const wrapBtn = document.createElement('button');
        wrapBtn.className = 'flex-btn' + (currentWrap === 'wrap' ? ' active' : '');
        wrapBtn.innerHTML = '<i class="fas fa-level-down-alt"></i> Wrap';
        wrapBtn.style.flex = '1';
        wrapBtn.onclick = () => {
            const current = this.getStyle('flexWrap');
            if (current === 'wrap') {
                this.applyStyle('flexWrap', 'nowrap');
                wrapBtn.classList.remove('active');
            } else {
                this.applyStyle('flexWrap', 'wrap');
                wrapBtn.classList.add('active');
            }
        };
        row.appendChild(wrapBtn);

        // Gap Input
        const gapInput = document.createElement('input');
        gapInput.className = 'prop-input';
        gapInput.placeholder = 'Gap (e.g. 10px)';
        gapInput.value = this.getStyle('gap') || '';
        gapInput.style.flex = '1';
        gapInput.onchange = (e) => {
            this.applyStyle('gap', e.target.value);
        };
        row.appendChild(gapInput);

        container.appendChild(row);

        return container;
    },

    setPreviewSize: function(size) {
        const canvas = document.getElementById('preview-canvas');
        if (canvas) {
            canvas.classList.remove('desktop', 'tablet', 'mobile');
            canvas.classList.add(size);
        }

        document.querySelectorAll('.preview-controls button').forEach(b => {
            if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(size)) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    },

    renderBoxModel: function(el) {
        const container = document.getElementById('box-model-container');
        if (!container) return;

        if (!el) {
             container.innerHTML = '<div class="no-selection">Select an element to view Box Model</div>';
             return;
        }

        const cs = window.getComputedStyle(el);
        const box = {
            margin: { t: cs.marginTop, r: cs.marginRight, b: cs.marginBottom, l: cs.marginLeft },
            border: { t: cs.borderTopWidth, r: cs.borderRightWidth, b: cs.borderBottomWidth, l: cs.borderLeftWidth },
            padding: { t: cs.paddingTop, r: cs.paddingRight, b: cs.paddingBottom, l: cs.paddingLeft },
            width: cs.width,
            height: cs.height
        };

        const format = (v) => parseInt(v) || 0;
        container.innerHTML = '';

        const createLayer = (name, vals, inner) => {
            const layer = document.createElement('div');
            layer.className = `bm-layer bm-${name}`;

            const lbl = document.createElement('div');
            lbl.className = 'bm-label';
            lbl.innerText = name;
            layer.appendChild(lbl);

            const sides = [
                { s: 'top', p: name + 'Top', k: 't' },
                { s: 'right', p: name + 'Right', k: 'r' },
                { s: 'bottom', p: name + 'Bottom', k: 'b' },
                { s: 'left', p: name + 'Left', k: 'l' }
            ];

            sides.forEach(side => {
                const valEl = document.createElement('div');
                valEl.className = `bm-val-${side.s}`;
                valEl.innerText = format(vals[side.k]);
                valEl.style.cursor = 'ew-resize';
                valEl.style.minWidth = '20px';
                valEl.style.minHeight = '15px';
                valEl.style.textAlign = 'center';

                const handleStart = (e) => {
                    e.preventDefault();
                    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
                    if (clientX === undefined) return;

                    const startX = clientX;
                    const startVal = format(vals[side.k]);

                    const onMove = (mE) => {
                        const currentX = mE.clientX || (mE.touches && mE.touches[0].clientX);
                        if (currentX === undefined) return;
                        const delta = currentX - startX;
                        const newVal = Math.max(0, startVal + delta);
                        valEl.innerText = newVal;
                        this.applyStyle(side.p + (name === 'border' ? 'Width' : ''), newVal + 'px');
                    };

                    const onEnd = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onEnd);
                        document.removeEventListener('touchmove', onMove);
                        document.removeEventListener('touchend', onEnd);
                        this.saveState();
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onEnd);
                    document.addEventListener('touchmove', onMove, { passive: false });
                    document.addEventListener('touchend', onEnd);
                };

                valEl.onmousedown = handleStart;
                valEl.ontouchstart = handleStart;
                layer.appendChild(valEl);
            });

            if (inner) layer.appendChild(inner);
            return layer;
        };

        const content = document.createElement('div');
        content.className = 'bm-content';
        content.innerText = `${format(box.width)} x ${format(box.height)}`;

        const pLayer = createLayer('padding', box.padding, content);
        const bLayer = createLayer('border', box.border, pLayer);
        const mLayer = createLayer('margin', box.margin, bLayer);

        container.appendChild(mLayer);
    },

    applyStyle: function(prop, value) {
        const el = Builder.selectedElement;
        if (!el) return;

        const target = this.styleTarget || 'inline';
        const targetName = this.styleTargetName || '';

        if (target === 'inline') {
            el.style[prop] = value;
        } else {
            // CSS Rule Logic
            // Prefix with #preview-canvas to scope
            let selector = '#preview-canvas ';
            if (target === 'id') selector += '#' + targetName;
            else if (target === 'class') selector += '.' + targetName;
            else if (target === 'tag') selector += targetName;

            // Find or create style sheet
            let styleEl = document.getElementById('vuc-custom-styles');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'vuc-custom-styles';
                document.head.appendChild(styleEl);
            }

            const sheet = styleEl.sheet;
            let rule = null;
            let rulesList = sheet.cssRules;
            let insertIndex = sheet.cssRules.length;
            let parentRule = sheet; // Default to sheet

            // Handle Media Query
            if (this.activeMediaQuery) {
                let mediaRule = null;
                for (let i = 0; i < sheet.cssRules.length; i++) {
                    if (sheet.cssRules[i].type === CSSRule.MEDIA_RULE &&
                        sheet.cssRules[i].conditionText === this.activeMediaQuery) {
                        mediaRule = sheet.cssRules[i];
                        break;
                    }
                }

                if (!mediaRule) {
                    try {
                        const idx = sheet.insertRule(`@media ${this.activeMediaQuery} {}`, sheet.cssRules.length);
                        mediaRule = sheet.cssRules[idx];
                    } catch (e) {
                        console.error("Invalid media query:", this.activeMediaQuery);
                        return;
                    }
                }

                rulesList = mediaRule.cssRules;
                insertIndex = mediaRule.cssRules.length;
                parentRule = mediaRule;
            }

            // Search existing rule in the correct list
            for (let i = rulesList.length - 1; i >= 0; i--) {
                if (rulesList[i].selectorText === selector) {
                    rule = rulesList[i];
                    break;
                }
            }

            if (!rule) {
                try {
                    const idx = parentRule.insertRule(`${selector} {}`, insertIndex);
                    rule = rulesList[idx];
                } catch(e) {
                    console.error("Invalid selector:", selector);
                    return;
                }
            }

            rule.style[prop] = value;
        }

        this.updateCode();
        this.saveState();

        if (['margin', 'padding', 'border', 'width', 'height'].some(p => prop.startsWith(p))) {
             this.renderBoxModel(el);
        }
    },

    getStyle: function(prop) {
         const el = Builder.selectedElement;
         if (!el) return '';

         const target = this.styleTarget || 'inline';
         const targetName = this.styleTargetName || '';

         if (target === 'inline') {
             return el.style[prop];
         } else {
             let styleEl = document.getElementById('vuc-custom-styles');
             if (!styleEl) return '';
             const sheet = styleEl.sheet;
             let selector = '#preview-canvas ';
             if (target === 'id') selector += '#' + targetName;
             else if (target === 'class') selector += '.' + targetName;
             else if (target === 'tag') selector += targetName;

             let rulesList = sheet.cssRules;

             // Handle Media Query
             if (this.activeMediaQuery) {
                let mediaRule = null;
                for (let i = 0; i < sheet.cssRules.length; i++) {
                    if (sheet.cssRules[i].type === CSSRule.MEDIA_RULE &&
                        sheet.cssRules[i].conditionText === this.activeMediaQuery) {
                        mediaRule = sheet.cssRules[i];
                        break;
                    }
                }
                if (!mediaRule) return ''; // No media rule, so no style
                rulesList = mediaRule.cssRules;
             }

             for (let i = rulesList.length - 1; i >= 0; i--) {
                 if (rulesList[i].selectorText === selector) {
                     return rulesList[i].style[prop];
                 }
             }
             return '';
         }
    },

    updatePropertyInspector: function(el) {
        const container = document.getElementById('property-inspector');
        container.innerHTML = '';

        if (!el) {
            container.innerHTML = '<div class="no-selection">Select an element to edit properties</div>';
            this.renderStructureTree();
            return;
        }

        // Auto-Detection: Determine best target if not explicitly set or when element changes
        if (!this.lastSelectedElement || this.lastSelectedElement !== el) {
            if (el.id) {
                this.styleTarget = 'id';
                this.styleTargetName = el.id;
            } else {
                const classes = Array.from(el.classList).filter(c => c !== 'dropped-element' && c !== 'selected');
                if (classes.length > 0) {
                    this.styleTarget = 'class';
                    this.styleTargetName = classes[0];
                } else {
                    this.styleTarget = 'tag';
                    this.styleTargetName = el.tagName.toLowerCase();
                }
            }
            this.lastSelectedElement = el;
        }

        this.highlightCodeForElement(el);
        this.renderStructureTree();
        this.renderBoxModel(el);

        // --- Selector & Media Query Header ---
        const header = document.createElement('div');
        header.className = 'selector-header';

        // Target Toggle Buttons: [ ID ], [ Class ], [ Tag ]
        const targetToggleGroup = document.createElement('div');
        targetToggleGroup.className = 'target-toggle-group';

        const createTargetBtn = (type, label, value) => {
            const btn = document.createElement('button');
            btn.className = 'target-btn' + (this.styleTarget === type ? ' active' : '');
            btn.innerHTML = `<span>${label}</span>`;
            if (value) {
                const valSpan = document.createElement('span');
                valSpan.className = 'btn-val';
                valSpan.innerText = value;
                btn.appendChild(valSpan);
            }
            btn.onclick = () => {
                this.styleTarget = type;
                this.styleTargetName = (value && value !== 'None') ? value.replace(/^\./, '') : '';
                this.updatePropertyInspector(el);
            };
            return btn;
        };

        // ID Button
        const idBtn = createTargetBtn('id', 'ID', el.id || 'None');
        idBtn.disabled = !el.id;
        targetToggleGroup.appendChild(idBtn);

        // Class Button
        const classes = Array.from(el.classList).filter(c => c !== 'dropped-element' && c !== 'selected');
        const classValue = classes.length > 0 ? '.' + (this.styleTarget === 'class' ? this.styleTargetName : classes[0]) : 'None';
        const classBtn = createTargetBtn('class', 'Class', classValue);
        classBtn.disabled = classes.length === 0;

        if (classes.length > 1) {
            classBtn.onclick = (e) => {
                e.stopPropagation();
                const currentIdx = classes.indexOf(this.styleTargetName);
                const nextIdx = (currentIdx + 1) % classes.length;
                this.styleTarget = 'class';
                this.styleTargetName = classes[nextIdx];
                this.updatePropertyInspector(el);
            };
            classBtn.title = "Click to cycle through classes";
        }
        targetToggleGroup.appendChild(classBtn);

        // Tag Button
        targetToggleGroup.appendChild(createTargetBtn('tag', 'Tag', el.tagName.toLowerCase()));

        header.appendChild(targetToggleGroup);

        // Row 2: Media Query
        const row2 = document.createElement('div');
        row2.className = 'selector-row';

        const mediaLabel = document.createElement('span');
        mediaLabel.innerText = '@media:';
        mediaLabel.style.width = '50px';
        mediaLabel.style.color = '#aaa';
        mediaLabel.style.fontSize = '11px';
        mediaLabel.style.display = 'flex';
        mediaLabel.style.alignItems = 'center';

        const mediaSelect = document.createElement('select');
        mediaSelect.className = 'selector-input';

        const mediaOptions = [
            { val: '', txt: 'None (Global)' },
            { val: '(max-width: 1200px)', txt: '< 1200px (Laptop)' },
            { val: '(max-width: 992px)', txt: '< 992px (Tablet)' },
            { val: '(max-width: 768px)', txt: '< 768px (Mobile)' },
            { val: '(min-width: 1200px)', txt: '> 1200px (Desktop)' }
        ];

        mediaOptions.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.val;
            o.innerText = opt.txt;
            if (this.activeMediaQuery === opt.val) o.selected = true;
            mediaSelect.appendChild(o);
        });

        mediaSelect.onchange = (e) => {
            this.activeMediaQuery = e.target.value;
            this.updatePropertyInspector(el);
        };

        row2.appendChild(mediaLabel);
        row2.appendChild(mediaSelect);
        header.appendChild(row2);
        // Row 2.5: TS Mode Toggle
        const rowTS = document.createElement('div');
        rowTS.className = 'selector-row';
        rowTS.style.alignItems = 'center';
        rowTS.innerHTML = `
            <label style="font-size:10px; color:#aaa; display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" id="ts-mode-toggle" ${this.isTSMode ? 'checked' : ''}> TypeScript Support
            </label>
        `;
        rowTS.querySelector('input').onchange = (e) => {
            this.isTSMode = e.target.checked;
        };
        header.appendChild(rowTS);

        // Row 3: Export Button
        const row3 = document.createElement('div');
        row3.className = 'selector-row';
        row3.style.justifyContent = 'flex-end';
        row3.style.gap = '5px';
        row3.style.marginTop = '5px';

        const importBtn = document.createElement('button');
        importBtn.className = 'small-btn';
        importBtn.innerHTML = '<i class="fas fa-file-import"></i> Import JS';
        importBtn.title = 'Import Selector to Monaco JS Editor';
        importBtn.style.flex = '1';
        importBtn.onclick = () => this.importElementToJS(el);

        const exportBtn = document.createElement('button');
        exportBtn.className = 'small-btn';
        exportBtn.innerHTML = '<i class="fas fa-file-export"></i> Export';
        exportBtn.title = 'Export Event Listener to JS/TS File';
        exportBtn.style.flex = '1';
        exportBtn.onclick = () => this.showExportToJSModal(el);

        row3.appendChild(importBtn);
        row3.appendChild(exportBtn);
        header.appendChild(row3);

        container.appendChild(header);

        // --- Helper: Create Accordion Group ---
        const createGroup = (title, inputs, isOpen = false) => {
            const group = document.createElement('div');
            group.className = 'prop-accordion';

            const head = document.createElement('div');
            head.className = 'prop-accordion-header';
            head.innerHTML = `<span>${title}</span> <i class="fas fa-chevron-${isOpen ? 'down' : 'right'}"></i>`;

            const content = document.createElement('div');
            content.className = 'prop-accordion-content' + (isOpen ? ' active' : '');

            head.onclick = () => {
                const isActive = content.classList.contains('active');
                if (isActive) {
                    content.classList.remove('active');
                    head.querySelector('i').className = 'fas fa-chevron-right';
                } else {
                    content.classList.add('active');
                    head.querySelector('i').className = 'fas fa-chevron-down';
                }
            };

            inputs.forEach(inp => content.appendChild(inp));

            group.appendChild(head);
            group.appendChild(content);
            container.appendChild(group);
        };

        const createInput = (label, value, onChange, type='text', options=[]) => {
            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = '8px';

            const lbl = document.createElement('label');
            lbl.className = 'prop-label';
            lbl.innerText = label;

            let inp;
            if (type === 'segmented') {
                const group = document.createElement('div');
                group.className = 'flex-options';
                options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'flex-btn' + (opt.value === value ? ' active' : '');
                    btn.innerHTML = opt.icon || opt.value;
                    btn.title = opt.value;
                    btn.onclick = () => {
                        onChange(opt.value);
                        Array.from(group.children).forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    };
                    group.appendChild(btn);
                });
                wrapper.appendChild(lbl);
                wrapper.appendChild(group);
                return wrapper;
            } else if (type === 'select') {
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

                // Palette Swatches
                const swatchRow = document.createElement('div');
                swatchRow.style.display = 'flex';
                swatchRow.style.flexWrap = 'wrap';
                swatchRow.style.gap = '4px';
                swatchRow.style.marginTop = '4px';

                const manageBtn = document.createElement('button');
                manageBtn.innerHTML = '<i class="fas fa-palette"></i>';
                manageBtn.title = "Manage Palette";
                manageBtn.className = "icon-btn";
                manageBtn.onclick = () => this.openColorPaletteManager();
                swatchRow.appendChild(manageBtn);

                this.projectColors.forEach(c => {
                    const s = document.createElement('div');
                    s.className = 'color-swatch';
                    // Support both string and object color items
                    const colorVal = typeof c === 'string' ? c : c.value;
                    s.style.backgroundColor = colorVal;
                    s.title = colorVal;
                    s.onclick = () => {
                        inp.value = colorVal;
                        picker.value = colorVal;
                        inp.dispatchEvent(new Event('input'));
                    };
                    swatchRow.appendChild(s);
                });
                wrapper.appendChild(swatchRow);

                const update = (e) => { onChange(e.target.value); };
                inp.onchange = (e) => { update(e); };
                inp.oninput = update;
                return wrapper;
            } else {
                inp = document.createElement('input');
                inp.className = 'prop-input';
                inp.type = type;
                inp.value = value || '';
            }

            // Numeric Scrubber Logic
            const isNumeric = /^-?\d*\.?\d+(px|em|rem|%|vh|vw|s|ms)?$/.test(value);
            if (isNumeric) {
                lbl.style.cursor = 'ew-resize';
                lbl.title = 'Click and drag to scrub value';
                lbl.style.userSelect = 'none';

                const handleStart = (e) => {
                    e.preventDefault();
                    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
                    if (clientX === undefined) return;

                    const startX = clientX;
                    const startVal = parseFloat(inp.value) || 0;
                    const unitMatch = inp.value.match(/[a-z%]+$/i);
                    const unit = unitMatch ? unitMatch[0] : 'px';

                    const onMove = (moveEvent) => {
                        const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
                        if (currentX === undefined) return;
                        const delta = currentX - startX;
                        const newVal = startVal + delta;
                        inp.value = newVal + unit;
                        onChange(inp.value);
                    };

                    const onEnd = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onEnd);
                        document.removeEventListener('touchmove', onMove);
                        document.removeEventListener('touchend', onEnd);
                        this.saveState();
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onEnd);
                    document.addEventListener('touchmove', onMove, { passive: false });
                    document.addEventListener('touchend', onEnd);
                };

                lbl.onmousedown = handleStart;
                lbl.ontouchstart = handleStart;
            }

            const update = (e) => {
                onChange(e.target.value);
            };

            inp.onchange = (e) => { update(e); };
            inp.oninput = update;

            wrapper.appendChild(lbl);
            wrapper.appendChild(inp);
            return wrapper;
        };

        // --- Identity & Attributes ---
        // Create datalists for suggestions
        const idDatalist = document.createElement('datalist');
        idDatalist.id = 'project-ids-list';
        this.projectIndex.ids.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            idDatalist.appendChild(opt);
        });
        container.appendChild(idDatalist);

        const classDatalist = document.createElement('datalist');
        classDatalist.id = 'project-classes-list';
        this.projectIndex.classes.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            classDatalist.appendChild(opt);
        });
        container.appendChild(classDatalist);

        const idInp = createInput('ID', el.id, (v) => { el.id = v; this.updateCode(); });
        idInp.querySelector('input').setAttribute('list', 'project-ids-list');

        const classInp = createInput('Classes', el.className.replace('dropped-element', '').replace('selected', '').trim(), (v) => {
            el.className = 'dropped-element selected ' + v;
            this.updateCode();
        });
        classInp.querySelector('input').setAttribute('list', 'project-classes-list');

        const identityInputs = [idInp, classInp];

        if (!['div', 'span', 'p', 'section', 'header', 'footer'].includes(el.tagName.toLowerCase())) {
             if (el.tagName.toLowerCase() === 'img') {
                identityInputs.push(createInput('Src', el.getAttribute('src'), (v) => { el.setAttribute('src', v); this.updateCode(); }));
                identityInputs.push(createInput('Alt', el.getAttribute('alt'), (v) => { el.setAttribute('alt', v); this.updateCode(); }));
             } else if (el.tagName.toLowerCase() === 'a') {
                identityInputs.push(createInput('Href', el.getAttribute('href'), (v) => { el.setAttribute('href', v); this.updateCode(); }));
             } else {
                identityInputs.push(createInput('Text Content', el.innerText, (v) => { el.innerText = v; this.updateCode(); }));
             }
        }
        createGroup('Attributes', identityInputs, true);

        // --- Layout ---
        const layoutInputs = [
            createInput('Display', this.getStyle('display'), (v) => {
                this.applyStyle('display', v);
                this.updatePropertyInspector(el);
            }, 'segmented', [
                { value: 'block', icon: '<i class="fas fa-square"></i>' },
                { value: 'flex', icon: '<i class="fas fa-columns"></i>' },
                { value: 'grid', icon: '<i class="fas fa-th"></i>' },
                { value: 'inline-block', icon: '<i class="fas fa-square" style="font-size:0.6em"></i>' },
                { value: 'none', icon: '<i class="fas fa-eye-slash"></i>' }
            ]),
            createInput('Position', this.getStyle('position'), (v) => this.applyStyle('position', v), 'segmented', [
                { value: 'static', icon: 'S' },
                { value: 'relative', icon: 'R' },
                { value: 'absolute', icon: 'A' },
                { value: 'fixed', icon: 'F' },
                { value: 'sticky', icon: 'K' }
            ]),
            createInput('Width', this.getStyle('width'), (v) => this.applyStyle('width', v)),
            createInput('Height', this.getStyle('height'), (v) => this.applyStyle('height', v)),
            createInput('Margin', this.getStyle('margin'), (v) => this.applyStyle('margin', v)),
            createInput('Padding', this.getStyle('padding'), (v) => this.applyStyle('padding', v)),
            createInput('Z-Index', this.getStyle('zIndex'), (v) => this.applyStyle('zIndex', v))
        ];

        if (this.getStyle('display') === 'flex') {
             const flexContainer = document.createElement('div');
             flexContainer.appendChild(this.createFlexBuilder(el));
             layoutInputs.push(flexContainer);
        }

        createGroup('Layout', layoutInputs, true);

        // --- Typography ---
        createGroup('Typography', [
            createInput('Font Family', this.getStyle('fontFamily'), (v) => this.applyStyle('fontFamily', v)),
            createInput('Font Size', this.getStyle('fontSize'), (v) => this.applyStyle('fontSize', v)),
            createInput('Font Weight', this.getStyle('fontWeight'), (v) => this.applyStyle('fontWeight', v), 'select', ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
            createInput('Color', this.getStyle('color'), (v) => this.applyStyle('color', v), 'color'),
            createInput('Text Align', this.getStyle('textAlign'), (v) => this.applyStyle('textAlign', v), 'select', ['left', 'center', 'right', 'justify']),
            createInput('Line Height', this.getStyle('lineHeight'), (v) => this.applyStyle('lineHeight', v)),
            createInput('Decoration', this.getStyle('textDecoration'), (v) => this.applyStyle('textDecoration', v), 'select', ['none', 'underline', 'overline', 'line-through'])
        ]);

        // --- Appearance ---
        createGroup('Appearance', [
            createInput('Background Color', this.getStyle('backgroundColor'), (v) => this.applyStyle('backgroundColor', v), 'color'),
            this.createGradientSlider(el),
            createInput('Opacity', this.getStyle('opacity'), (v) => this.applyStyle('opacity', v)),
            createInput('Border', this.getStyle('border'), (v) => this.applyStyle('border', v)),
            createInput('Border Radius', this.getStyle('borderRadius'), (v) => this.applyStyle('borderRadius', v)),
            this.createCornerMapper(el),
            createInput('Box Shadow', this.getStyle('boxShadow'), (v) => this.applyStyle('boxShadow', v)),
            this.createShadowJoystick(el),
            createInput('Cursor', this.getStyle('cursor'), (v) => this.applyStyle('cursor', v), 'select', ['default', 'pointer', 'text', 'move', 'not-allowed'])
        ]);

        // --- Effects ---
        createGroup('Effects', [
            createInput('Transform', this.getStyle('transform'), (v) => this.applyStyle('transform', v)),
            createInput('Transition', this.getStyle('transition'), (v) => this.applyStyle('transition', v))
        ]);

        this.renderJSPanel();
    },

    renderJSPanel: function() {
        const container = document.getElementById('js-panel-content');
        if (!container) return;

        const el = Builder.selectedElement;
        if (!el) {
            container.innerHTML = '<div class="no-selection">Select an element to manage events</div>';
            return;
        }

        container.innerHTML = '';

        // Presets
        const pHead = document.createElement('div');
        pHead.className = 'panel-header';
        pHead.innerText = 'Quick Presets';
        pHead.style.background = 'transparent';
        pHead.style.paddingLeft = '0';
        container.appendChild(pHead);

        const presetGrid = document.createElement('div');
        presetGrid.style.display = 'grid';
        presetGrid.style.gridTemplateColumns = '1fr 1fr 1fr';
        presetGrid.style.gap = '5px';
        presetGrid.style.marginBottom = '20px';

        ['click', 'input', 'submit', 'change', 'mouseover', 'keydown'].forEach(evt => {
            const btn = document.createElement('button');
            btn.className = 'small-btn';
            btn.innerText = evt;
            btn.onclick = () => this.generateEventListener(el, evt);
            presetGrid.appendChild(btn);
        });
        container.appendChild(presetGrid);

        // Inline Events
        const iHead = document.createElement('div');
        iHead.className = 'panel-header';
        iHead.innerText = 'Inline Handlers (onclick=...)';
        iHead.style.background = 'transparent';
        iHead.style.paddingLeft = '0';
        container.appendChild(iHead);

        // Event List
        const events = ['click', 'dblclick', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 'change', 'input', 'submit', 'keydown', 'keyup'];

        events.forEach(evt => {
            const wrapper = document.createElement('div');
            wrapper.className = 'js-event-item';
            wrapper.style.marginBottom = '10px';
            wrapper.style.border = '1px solid #333';
            wrapper.style.borderRadius = '4px';
            wrapper.style.overflow = 'hidden';

            // Header
            const header = document.createElement('div');
            header.style.padding = '8px 10px';
            header.style.background = '#333';
            header.style.cursor = 'pointer';
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';

            const hasEvent = el.hasAttribute('on' + evt);

            header.innerHTML = `
                <span>on${evt}</span>
                <i class="fas fa-chevron-down" style="font-size:0.8em; transform:${hasEvent ? 'rotate(180deg)' : 'rotate(0deg)'}"></i>
            `;

            // Content
            const content = document.createElement('div');
            content.style.display = hasEvent ? 'block' : 'none';
            content.style.padding = '10px';
            content.style.background = '#1e1e1e';

            const textarea = document.createElement('textarea');
            textarea.className = 'prop-input'; // Reuse style
            textarea.style.width = '100%';
            textarea.style.minHeight = '60px';
            textarea.style.fontFamily = 'monospace';
            textarea.placeholder = `// Code for on${evt}...`;
            textarea.value = el.getAttribute('on' + evt) || '';

            textarea.addEventListener('change', (e) => {
                const val = e.target.value.trim();
                if (val) {
                    el.setAttribute('on' + evt, val);
                } else {
                    el.removeAttribute('on' + evt);
                }
                App.updateCode();
                App.saveState();

                // Update header icon
                const icon = header.querySelector('.fa-chevron-down');
                if (icon) icon.style.transform = 'rotate(180deg)';
            });

            content.appendChild(textarea);

            // Toggle
            header.onclick = () => {
                const isVisible = content.style.display === 'block';
                content.style.display = isVisible ? 'none' : 'block';
                const icon = header.querySelector('.fa-chevron-down');
                if (icon) icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
            };

            wrapper.appendChild(header);
            wrapper.appendChild(content);
            container.appendChild(wrapper);
        });
    },

    updateCode: function() {
        const activeBtn = document.querySelector('.code-tabs button.active');
        if (!activeBtn) return;
        const activeTab = activeBtn.dataset.lang;
        this.updateCodeView(activeTab);
    },

    syncCodeToCanvas: function() {
        // Use Monaco if available
        let code;
        if (window.monacoEditor) {
            code = window.monacoEditor.getValue();
        } else {
            const editor = document.getElementById('code-editor');
            if (!editor) return;
            code = editor.value;
        }

        const activeBtn = document.querySelector('.code-tabs button.active');
        if (!activeBtn) return;
        const activeTab = activeBtn.dataset.lang;

        if (activeTab === 'html') {
            // Extract body content if wrapped in <html><body>...</body></html>
            let bodyContent = code;
            if (code.includes('<body')) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(code, 'text/html');
                bodyContent = doc.body.innerHTML;
            }

            Builder.loadHTML(bodyContent);
            this.renderStructureTree();

            // Debounce save
            this.saveStateDebounced();
        } else if (activeTab === 'css') {
             let styleTag = document.getElementById('custom-css');
             if (!styleTag) {
                 styleTag = document.createElement('style');
                 styleTag.id = 'custom-css';
                 document.head.appendChild(styleTag);
             }
             styleTag.textContent = code;
             this.currentCSSContent = code; // Update memory
             // We could debounce save to file here if we wanted auto-save
          } else if (activeTab === 'js') {
             // Handle Global JS
             let scriptEl = Builder.canvas.querySelector('#custom-global-js');
             if (!scriptEl) {
                 scriptEl = document.createElement('script');
                 scriptEl.id = 'custom-global-js';
                 Builder.canvas.appendChild(scriptEl);
             }
             scriptEl.innerText = code;
             this.saveStateDebounced();
        }
    },

    generateBoilerplate: function() {
        const activeBtn = document.querySelector('.code-tabs button.active');
        const activeTab = activeBtn ? activeBtn.dataset.lang : 'html';

        if (activeTab !== 'html') {
            alert('Please switch to the HTML tab to generate boilerplate.');
            return;
        }

        const boilerplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Project</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container" style="padding: 20px; font-family: sans-serif;">
        <h1>Hello World</h1>
        <p>Start building your project here.</p>
        <button class="btn" style="padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Click Me</button>
    </div>
</body>
</html>`;

        if (confirm('This will overwrite the current editor content with a standard HTML5 boilerplate. Continue?')) {
            if (window.monacoEditor) {
                window.monacoEditor.setValue(boilerplate);
            } else {
                const editor = document.getElementById('code-editor');
                if (editor) editor.value = boilerplate;
            }
            this.syncCodeToCanvas();
            this.logConsole('Generated HTML boilerplate', 'info');
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
             if (this.currentCSSContent) {
                 window.monacoEditor.setValue(this.currentCSSContent);
             } else {
                  window.monacoEditor.setValue("/* Open a CSS file to edit styles. */");
             }
         } else if (lang === 'js') {
            const scriptEl = Builder.canvas.querySelector('#custom-global-js');
            const val = scriptEl ? scriptEl.innerText : "// Custom JavaScript\n// Code here will run globally";
            window.monacoEditor.setValue(val);
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
            this.renderStructureTree();
        }
    },

    redo: function() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            Builder.loadHTML(this.history[this.historyIndex]);
            this.updateCode();
            this.updateUndoRedoButtons();
            Builder.deselectElement();
            this.renderStructureTree();
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

        if (!input || !output || !btn) return;

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
        const activeBtn = document.querySelector('.code-tabs button.active');
        const activeTab = activeBtn ? activeBtn.dataset.lang : 'html';

        if (activeTab === 'css' && this.currentCSSPath) {
             // Save CSS
             const content = window.monacoEditor ? window.monacoEditor.getValue() : this.currentCSSContent;
             fetch('/api/save_file', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ filename: this.currentCSSPath, content: content })
             })
             .then(res => res.json())
             .then(data => {
                 if (data.error) alert(data.error);
                 else this.logConsole('Saved ' + this.currentCSSPath, 'success');
             });
             return;
        }

        // Save HTML (Project)
        let path = this.currentFilePath;
        // If current file is not HTML (e.g. it's CSS), try to find the main HTML file
        if (!path || !path.toLowerCase().endsWith('.html')) {
            path = this.currentProjectPath ? (this.currentProjectPath + '/index.html') : null;
        }

        if (path) {
             fetch('/api/save_file', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ filename: path, content: Builder.getHTML() })
             })
             .then(res => res.json())
             .then(data => {
                 if (data.error) alert(data.error);
                 else this.logConsole('Saved project to ' + path, 'success');
             });
        } else {
            // Save to local storage for now
            const html = Builder.getHTML();
            localStorage.setItem('vuc_project', html);
            alert('Project saved to local storage (no file path)!');
        }
    },

    exportProject: function() {
        const html = Builder.getHTML();

        // Get Root Variables
        const rootVars = document.getElementById('vuc-root-vars');
        const rootVarsCss = rootVars ? rootVars.innerHTML : '';

        const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Exported Project</title>
    <style>body { font-family: sans-serif; }</style>
    ${rootVarsCss ? `<style id="project-vars">\n${rootVarsCss}\n</style>` : ''}
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

window.App = App;
window.onload = () => App.init();
