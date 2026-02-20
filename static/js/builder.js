const Builder = {
    selectedElements: [],
    draggedType: null,
    canvas: null,
    hoveredElement: null,
    clipboard: null,

    init: function() {
        this.canvas = document.getElementById('preview-canvas');
        if (!this.canvas) {
            console.error('Builder: Preview canvas not found');
            return;
        }
        this.setupDragAndDrop();
        this.setupCanvasInteractions();
        this.setupTooltip();
        this.setupShortcuts();
    },

    setupShortcuts: function() {
        document.addEventListener('keydown', (e) => {
            // Only trigger if we are not in an input/textarea or contenteditable
            if (e.target.tagName === 'INPUT' || 
                e.target.tagName === 'TEXTAREA' || 
                e.target.isContentEditable) return;

            // Shift + C: Copy
            if (e.shiftKey && (e.key === 'C' || e.key === 'c')) {
                e.preventDefault();
                this.copySelected();
            }

            // Shift + V: Paste
            if (e.shiftKey && (e.key === 'V' || e.key === 'v')) {
                e.preventDefault();
                this.pasteToSelected();
            }

            // Shift + D: Wrap in Div
            if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
                e.preventDefault();
                this.wrapSelected('div');
            }

            // Shift + S: Wrap Hovered Text in Span
            if (e.shiftKey && (e.key === 'S' || e.key === 's')) {
                e.preventDefault();
                this.wrapHoveredText();
            }

            // Move Up/Down (Alt + Up/Down)
            if (e.altKey && (e.key === 'ArrowUp')) {
                e.preventDefault();
                this.moveSelected('up');
            }
            if (e.altKey && (e.key === 'ArrowDown')) {
                e.preventDefault();
                this.moveSelected('down');
            }
        });
    },

    copySelected: function() {
        if (this.selectedElements.length === 0) return;
        // Clone the first selected element
        this.clipboard = this.selectedElements[0].cloneNode(true);
        // Remove selection classes from clipboard
        this.clipboard.classList.remove('selected');
        this.clipboard.style.outline = '';
        if (window.App) window.App.logConsole('Element copied to clipboard', 'info');
    },

    pasteToSelected: function() {
        if (!this.clipboard) return;
        
        let target = this.canvas;
        if (this.selectedElements.length > 0) {
            target = this.selectedElements[0];
        }

        // If target is not a container, append to its parent? Or after it?
        // Usually paste *inside* if container, or *after* if not?
        // User said "place". Let's assume append child if container, else append to parent.
        
        let appendTarget = target;
        if (!this.isContainer(target) && target !== this.canvas) {
            appendTarget = target.parentNode;
        }

        const clone = this.clipboard.cloneNode(true);
        
        // Regenerate IDs
        const rehydrate = (el) => {
            el.id = el.tagName.toLowerCase() + '-' + Math.random().toString(36).substr(2, 9);
            el.classList.add('dropped-element'); // Ensure it has the class
            Array.from(el.children).forEach(rehydrate);
        };
        rehydrate(clone);

        appendTarget.appendChild(clone);
        this.selectElement(clone);
        if (window.App) {
            window.App.updateCode();
            window.App.saveState();
            window.App.logConsole('Element pasted', 'success');
        }
    },

    wrapSelected: function(tagName) {
        if (this.selectedElements.length === 0) return;
        
        const firstEl = this.selectedElements[0];
        const parent = firstEl.parentNode;
        
        // Filter elements that share the same parent as the first one
        const siblings = this.selectedElements.filter(el => el.parentNode === parent);
        
        // Create wrapper
        const wrapper = document.createElement(tagName);
        wrapper.id = tagName + '-' + Math.random().toString(36).substr(2, 9);
        wrapper.classList.add('dropped-element');
        wrapper.style.padding = '10px'; // Visual aid
        
        // Find the first occurrence in the DOM to insert before
        let insertRef = null;
        // Use Array.from to iterate safely while modifying? No, we just need to find position.
        const children = Array.from(parent.children);
        for (let child of children) {
            if (siblings.includes(child)) {
                insertRef = child;
                break;
            }
        }
        
        if (insertRef) {
            parent.insertBefore(wrapper, insertRef);
            
            // Move siblings into wrapper in order
            // We collect them first based on DOM order
            const toMove = children.filter(child => siblings.includes(child));
            
            toMove.forEach(child => {
                wrapper.appendChild(child);
            });
        }
        
        // Select wrapper
        this.selectElement(wrapper);
        
        if (window.App) {
            window.App.updateCode();
            window.App.saveState();
            window.App.logConsole(`Wrapped ${siblings.length} elements in <${tagName}>`, 'success');
        }
    },

    wrapHoveredText: function() {
        if (!this.hoveredElement) return;
        
        const el = this.hoveredElement;
        // Check if it has text content
        if (!el.textContent.trim()) return;

        // Safety Check: Don't wrap if it contains block elements
        // This prevents invalid HTML (block inside inline span)
        const hasBlockChildren = Array.from(el.children).some(child => {
            const display = window.getComputedStyle(child).display;
            return display === 'block' || display === 'flex' || display === 'grid' || 
                   ['DIV','P','SECTION','H1','H2','H3','H4','H5','H6','UL','OL','LI','TABLE','FORM'].includes(child.tagName);
        });
        
        if (hasBlockChildren) {
             if (window.App) window.App.logConsole('Cannot wrap block elements in span', 'warning');
             return;
        }

        // We want to wrap the *text content* in a span
        // But we don't want to break existing structure if it's complex.
        // Simple case: The element contains text nodes.
        
        // Strategy: specific text node selection would be hard without mouse selection.
        // "enclose the text into a span" -> imply the whole text of the element?
        // Let's create a span, put the content inside, and replace.
        
        // If element IS a text node? (Mouse events usually target the element)
        
        // If the element is already a leaf node or mainly text
        const span = document.createElement('span');
        span.classList.add('dropped-element');
        span.id = 'span-' + Math.random().toString(36).substr(2, 9);
        
        // Move all children to span?
        while (el.firstChild) {
            span.appendChild(el.firstChild);
        }
        
        el.appendChild(span);
        
        if (window.App) {
            window.App.updateCode();
            window.App.saveState();
            window.App.logConsole('Text wrapped in <span>', 'success');
        }
    },

    moveSelected: function(direction) {
        if (this.selectedElements.length === 0) return;
        const el = this.selectedElements[0];
        const parent = el.parentNode;
        
        if (direction === 'up') {
            const prev = el.previousElementSibling;
            if (prev) {
                parent.insertBefore(el, prev);
            }
        } else if (direction === 'down') {
            const next = el.nextElementSibling;
            if (next) {
                // insertBefore next.nextSibling (which is null if next is last, which works for append)
                parent.insertBefore(el, next.nextElementSibling);
            }
        }
        
        if (window.App) {
            window.App.updateCode();
            window.App.saveState();
        }
    },

    setupTooltip: function() {
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'builder-tooltip';
        tooltip.style.display = 'none';
        document.body.appendChild(tooltip);
        this.tooltip = tooltip;

        // Mouse move handler
        this.canvas.addEventListener('mousemove', (e) => {
            const target = e.target;
            this.hoveredElement = target;
            
            // Don't show for canvas itself
            if (target === this.canvas || target.classList.contains('preview-canvas')) {
                tooltip.style.display = 'none';
                this.hoveredElement = null;
                return;
            }

            // Get info
            const tagName = target.tagName.toLowerCase();
            const id = target.id;
            const classes = Array.from(target.classList)
                .filter(c => c !== 'dropped-element' && c !== 'selected')
                .join('.');
                
            // Build Content
            let content = `<span class="tag">${tagName}</span>`;
            
            // Only show ID if it has a value
            if (id && id.trim() !== '') {
                content += `<span class="id">#${id}</span>`;
            }
            
            // Always show classes if they exist
            if (classes) {
                content += `<span class="class">.${classes}</span>`;
            }
            
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';

            // Positioning
            const offset = 20; // Distance from cursor
            let left = e.clientX;
            let top = e.clientY - offset - tooltip.offsetHeight; // Position above cursor

            // Boundary checks
            // 1. Top boundary: if tooltip goes above viewport, move it below cursor
            if (top < 0) {
                top = e.clientY + offset; 
            }
            
            // 2. Right boundary: if tooltip goes off-screen right, shift left
            if (left + tooltip.offsetWidth > window.innerWidth) {
                left = window.innerWidth - tooltip.offsetWidth - 10;
            }
            
            // 3. Left boundary: ensure it doesn't go off-screen left
            if (left < 0) {
                left = 10;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        });

        // Hide on leave
        this.canvas.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            this.hoveredElement = null;
        });
    },

    setupDragAndDrop: function() {
        // Sidebar draggable items
        const draggables = document.querySelectorAll('.draggable-item');
        draggables.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                // Use 'item' or 'e.currentTarget' to ensure we get the data-type from the container
                // even if the user dragged a child icon/text
                this.draggedType = item.dataset.type; 
                e.dataTransfer.setData('text/plain', this.draggedType);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Canvas drop zone
        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            this.highlightDropTarget(e.target);
        });

        this.canvas.addEventListener('dragleave', (e) => {
            this.removeHighlight(e.target);
        });

        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeHighlight(e.target);
            
            // Determine drop target (canvas or nested element)
            let target = e.target;
            
            // If dropped on an existing element in canvas
            if (target !== this.canvas && !target.classList.contains('preview-canvas')) {
                // If it's not a container, go to parent
                if (!this.isContainer(target)) {
                    target = target.parentElement;
                }
            } else {
                target = this.canvas;
            }
            
            // Check if we have a selected container and we dropped on the canvas (not specifically on another element)
            // The user asked: "Divs must be draggable onto the code or onto selected objects."
            // If I drop "loosely" on the canvas, but I have a container selected, maybe it should go there?
            // Standard behavior is usually "drop where you point". 
            // However, let's respect the "onto selected objects" if the drop target is the generic canvas 
            // and we have exactly one container selected.
            if ((target === this.canvas || target.classList.contains('preview-canvas')) && 
                this.selectedElements.length === 1 && 
                this.isContainer(this.selectedElements[0])) {
                target = this.selectedElements[0];
            }

            const fileData = e.dataTransfer.getData('application/x-visual-ui-file');
            if (fileData) {
                if (window.App) window.App.handleFileDrop(JSON.parse(fileData), target);
                return;
            }

            const type = e.dataTransfer.getData('text/plain');
            // Handle color drop
            if (type && type.startsWith('color:')) {
                const color = type.split(':')[1];
                if (target !== this.canvas) {
                    target.style.backgroundColor = color;
                    if (window.App) window.App.saveState();
                }
                return;
            }

            if (type === 'saved-block') {
                const blockId = e.dataTransfer.getData('application/vuc-block-id');
                this.createSavedBlock(blockId, target);
                if (window.App) window.App.updateCode();
            } else if (type) {
                this.createElement(type, target);
                if (window.App) window.App.updateCode();
            }
        });
    },

    createSavedBlock: function(blockId, parent) {
        if (!window.App || !window.App.savedBlocks) return;
        
        const block = window.App.savedBlocks.find(b => b.id === blockId);
        if (!block) return;
        
        // Create a temporary container to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = block.html;
        
        Array.from(temp.children).forEach(child => {
            const clone = child.cloneNode(true);
            
            // Recursive class adder
            const addClasses = (el) => {
                el.classList.add('dropped-element');
                // Remove 'selected' if it was saved as selected
                el.classList.remove('selected');
                
                // If it doesn't have an ID, give it one
                if (!el.id) el.id = 'saved-' + Math.random().toString(36).substr(2, 9);
                
                Array.from(el.children).forEach(addClasses);
            };
            addClasses(clone);
            
            parent.appendChild(clone);
            this.selectElement(clone);
        });
        
        if (window.App) window.App.saveState();
    },

    setupCanvasInteractions: function() {
        this.canvas.addEventListener('click', (e) => {
            // Prevent triggering if clicking on canvas background (unless we want to deselect)
            if (e.target === this.canvas || e.target.classList.contains('preview-canvas')) {
                this.deselectAll();
                return;
            }
            
            e.stopPropagation();
            
            // Multi-select with Ctrl or Meta (Cmd)
            const multi = e.ctrlKey || e.metaKey;
            this.selectElement(e.target, multi);
        });
    },

    isContainer: function(element) {
        // Define which tags can contain other elements
        const voidTags = ['img', 'input', 'hr', 'br', 'meta', 'link'];
        return !voidTags.includes(element.tagName.toLowerCase());
    },

    highlightDropTarget: function(target) {
        if (target === this.canvas) {
            target.style.outline = '2px dashed #007acc';
        } else {
            target.style.outline = '2px dashed #007acc';
        }
    },

    removeHighlight: function(target) {
        target.style.outline = '';
    },

    createElement: function(type, parent) {
        if (!type || !ComponentDefinitions[type]) {
            console.warn('Invalid component type:', type);
            return;
        }

        const def = ComponentDefinitions[type];
        
        // Ensure we are creating the correct tag
        const el = document.createElement(def.tag);
        
        // Add default classes
        el.classList.add('dropped-element');
        if (def.attributes.class) {
             const classes = def.attributes.class.split(' ');
             classes.forEach(c => { if(c) el.classList.add(c); });
        }

        // Add default styles
        Object.assign(el.style, def.defaultStyles);

        // Add attributes
        for (const [key, value] of Object.entries(def.attributes)) {
            if (key !== 'class') {
                el.setAttribute(key, value);
            }
        }

        // Add content
        if (!def.isVoid && def.defaultContent) {
            el.innerText = def.defaultContent;
        }

        // Generate a unique ID
        const id = type + '-' + Math.random().toString(36).substr(2, 9);
        el.id = id;

        // Append to parent
        parent.appendChild(el);
        this.selectElement(el);
        
        // Add to history (Undo/Redo) - handled by App
        if (window.App) window.App.saveState();
    },

    selectElement: function(el, multi = false) {
        if (!multi) {
            this.deselectAll();
        }

        if (this.selectedElements.includes(el)) {
            // If already selected and multi, toggle off
            if (multi) {
                el.classList.remove('selected');
                this.selectedElements = this.selectedElements.filter(e => e !== el);
                // Update Inspector
                if (window.App) {
                     if (this.selectedElements.length === 1) {
                         window.App.updatePropertyInspector(this.selectedElements[0]);
                     } else if (this.selectedElements.length > 1) {
                         window.App.updatePropertyInspector(null, this.selectedElements.length);
                     } else {
                         window.App.updatePropertyInspector(null);
                     }
                }
                return;
            }
            // If single select and already selected, do nothing (keep selected)
        } else {
            this.selectedElements.push(el);
            el.classList.add('selected');
        }
        
        // Update Property Inspector
        if (window.App) {
            if (this.selectedElements.length === 1) {
                window.App.updatePropertyInspector(this.selectedElements[0]);
            } else {
                window.App.updatePropertyInspector(null, this.selectedElements.length);
            }
        }
    },

    deselectAll: function() {
        this.selectedElements.forEach(el => el.classList.remove('selected'));
        this.selectedElements = [];
        if (window.App) window.App.updatePropertyInspector(null);
    },
    
    // Select all elements in the canvas
    selectAll: function() {
        const all = this.canvas.querySelectorAll('.dropped-element');
        this.deselectAll(); // Clear first
        all.forEach(el => {
            el.classList.add('selected');
            this.selectedElements.push(el);
        });
        if (window.App) window.App.updatePropertyInspector(null, this.selectedElements.length);
    },

    // Helper to get current DOM as string
    getHTML: function() {
        // Clone canvas to clean up class names (remove .dropped-element, .selected)
        const clone = this.canvas.cloneNode(true);
        
        // Clean up
        const cleanElements = (element) => {
            if (element.classList) {
                element.classList.remove('dropped-element');
                element.classList.remove('selected');
                element.style.outline = ''; // Remove drag highlights
                if (element.classList.length === 0) {
                    element.removeAttribute('class');
                }
            }
            Array.from(element.children).forEach(cleanElements);
        };
        
        Array.from(clone.children).forEach(cleanElements);
        
        return clone.innerHTML;
    },
    
    // Load from HTML string (for undo/redo or load)
    loadHTML: function(html) {
        this.canvas.innerHTML = html;
        // Re-attach listeners or add classes? 
        // The classes 'dropped-element' are needed for interactions
        const rehydrate = (element) => {
            element.classList.add('dropped-element');
            Array.from(element.children).forEach(rehydrate);
        };
        Array.from(this.canvas.children).forEach(rehydrate);
        this.selectedElements = []; // Clear selection on load
    }
};
