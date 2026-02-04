const ComponentDefinitions = {
    // --- Layout & Containers ---
    div: {
        tag: 'div',
        name: 'Div Block',
        defaultContent: '',
        defaultStyles: { 'padding': '20px', 'border': '1px dashed #ccc', 'min-height': '50px', 'background-color': '#ffffff', 'margin-bottom': '10px' },
        attributes: { class: '' }
    },
    section: {
        tag: 'section',
        name: 'Section',
        defaultContent: '',
        defaultStyles: { 'padding': '40px 20px', 'background-color': '#f8f9fa', 'min-height': '100px', 'margin-bottom': '10px' },
        attributes: { class: '' }
    },
    container: {
        tag: 'div',
        name: 'Container',
        defaultContent: '',
        defaultStyles: { 'max-width': '1200px', 'margin': '0 auto', 'padding': '0 15px', 'min-height': '50px', 'border': '1px dotted #999' },
        attributes: { class: 'container' }
    },
    header: {
        tag: 'header',
        name: 'Header',
        defaultContent: '',
        defaultStyles: { 'padding': '20px', 'background-color': '#333', 'color': 'white', 'min-height': '60px' },
        attributes: { class: 'site-header' }
    },
    footer: {
        tag: 'footer',
        name: 'Footer',
        defaultContent: '',
        defaultStyles: { 'padding': '30px', 'background-color': '#222', 'color': '#ccc', 'min-height': '100px', 'margin-top': 'auto' },
        attributes: { class: 'site-footer' }
    },
    nav: {
        tag: 'nav',
        name: 'Navigation',
        defaultContent: '',
        defaultStyles: { 'display': 'flex', 'gap': '20px', 'padding': '10px' },
        attributes: { class: 'navbar' }
    },
    article: {
        tag: 'article',
        name: 'Article',
        defaultContent: '',
        defaultStyles: { 'padding': '20px', 'border': '1px solid #eee', 'margin-bottom': '20px' },
        attributes: { class: '' }
    },
    aside: {
        tag: 'aside',
        name: 'Sidebar/Aside',
        defaultContent: '',
        defaultStyles: { 'width': '250px', 'padding': '15px', 'background-color': '#f4f4f4', 'border-left': '1px solid #ddd' },
        attributes: { class: '' }
    },
    main: {
        tag: 'main',
        name: 'Main Content',
        defaultContent: '',
        defaultStyles: { 'flex': '1', 'padding': '20px' },
        attributes: { role: 'main' }
    },

    // --- Typography ---
    h1: { tag: 'h1', name: 'Heading 1', defaultContent: 'Heading 1', defaultStyles: { 'margin-bottom': '15px', 'font-size': '2.5rem' }, attributes: {} },
    h2: { tag: 'h2', name: 'Heading 2', defaultContent: 'Heading 2', defaultStyles: { 'margin-bottom': '12px', 'font-size': '2rem' }, attributes: {} },
    h3: { tag: 'h3', name: 'Heading 3', defaultContent: 'Heading 3', defaultStyles: { 'margin-bottom': '10px', 'font-size': '1.75rem' }, attributes: {} },
    p: { tag: 'p', name: 'Paragraph', defaultContent: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.', defaultStyles: { 'margin-bottom': '1rem', 'line-height': '1.5' }, attributes: {} },
    span: { tag: 'span', name: 'Text Span', defaultContent: 'text span', defaultStyles: {}, attributes: {} },
    link: { tag: 'a', name: 'Link', defaultContent: 'Link Text', defaultStyles: { 'color': '#007acc', 'text-decoration': 'underline', 'cursor': 'pointer' }, attributes: { href: '#' } },

    // --- Forms ---
    form: {
        tag: 'form',
        name: 'Form Wrapper',
        defaultContent: '',
        defaultStyles: { 'padding': '20px', 'border': '1px solid #ddd', 'border-radius': '4px' },
        attributes: { action: '', method: 'post' }
    },
    label: {
        tag: 'label',
        name: 'Label',
        defaultContent: 'Label Text',
        defaultStyles: { 'display': 'block', 'margin-bottom': '5px', 'font-weight': 'bold' },
        attributes: {}
    },
    button: {
        tag: 'button',
        name: 'Button',
        defaultContent: 'Click Me',
        defaultStyles: {
            'padding': '10px 20px', 'background-color': '#007acc', 'color': 'white', 'border': 'none',
            'border-radius': '4px', 'cursor': 'pointer', 'font-size': '16px', 'margin': '5px'
        },
        attributes: { type: 'button', class: 'btn' }
    },
    input: {
        tag: 'input',
        name: 'Text Input',
        isVoid: true,
        defaultStyles: { 'padding': '8px 12px', 'border': '1px solid #ccc', 'border-radius': '4px', 'font-size': '14px', 'margin': '5px', 'width': '100%', 'max-width': '300px' },
        attributes: { type: 'text', placeholder: 'Enter text...', class: 'form-control' }
    },
    input_email: {
        tag: 'input',
        name: 'Email Input',
        isVoid: true,
        defaultStyles: { 'padding': '8px 12px', 'border': '1px solid #ccc', 'border-radius': '4px', 'font-size': '14px', 'margin': '5px', 'width': '100%', 'max-width': '300px' },
        attributes: { type: 'email', placeholder: 'name@example.com', class: 'form-control' }
    },
    input_password: {
        tag: 'input',
        name: 'Password Input',
        isVoid: true,
        defaultStyles: { 'padding': '8px 12px', 'border': '1px solid #ccc', 'border-radius': '4px', 'font-size': '14px', 'margin': '5px', 'width': '100%', 'max-width': '300px' },
        attributes: { type: 'password', placeholder: 'Password', class: 'form-control' }
    },
    textarea: {
        tag: 'textarea',
        name: 'Text Area',
        defaultContent: '',
        defaultStyles: { 'padding': '8px 12px', 'border': '1px solid #ccc', 'border-radius': '4px', 'font-size': '14px', 'margin': '5px', 'width': '100%', 'max-width': '400px', 'height': '100px' },
        attributes: { placeholder: 'Enter long text...', class: 'form-control' }
    },
    checkbox: {
        tag: 'input',
        name: 'Checkbox',
        isVoid: true,
        defaultStyles: { 'margin-right': '5px' },
        attributes: { type: 'checkbox', class: 'form-check-input' }
    },
    radio: {
        tag: 'input',
        name: 'Radio Button',
        isVoid: true,
        defaultStyles: { 'margin-right': '5px' },
        attributes: { type: 'radio', class: 'form-check-input' }
    },
    select: {
        tag: 'select',
        name: 'Select Dropdown',
        defaultContent: '<option>Option 1</option><option>Option 2</option>',
        defaultStyles: { 'padding': '8px', 'border-radius': '4px', 'border': '1px solid #ccc' },
        attributes: { class: 'form-select' }
    },

    // --- Media ---
    image: {
        tag: 'img',
        name: 'Image',
        isVoid: true,
        defaultStyles: { 'max-width': '100%', 'height': 'auto', 'display': 'block', 'margin': '10px 0' },
        attributes: { src: 'https://via.placeholder.com/300x200', alt: 'Placeholder Image', class: 'img-fluid' }
    },
    video: {
        tag: 'video',
        name: 'Video',
        defaultContent: '',
        defaultStyles: { 'max-width': '100%', 'height': 'auto', 'background-color': '#000' },
        attributes: { controls: true, src: '' }
    },
    audio: {
        tag: 'audio',
        name: 'Audio Player',
        defaultContent: '',
        defaultStyles: { 'width': '300px' },
        attributes: { controls: true, src: '' }
    },
    iframe: {
        tag: 'iframe',
        name: 'Iframe/Embed',
        defaultContent: '',
        defaultStyles: { 'width': '100%', 'height': '300px', 'border': 'none' },
        attributes: { src: 'about:blank' }
    }
};
