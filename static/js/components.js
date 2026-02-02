const ComponentDefinitions = {
    div: {
        tag: 'div',
        name: 'Div Block',
        defaultContent: '',
        defaultStyles: {
            'padding': '20px',
            'border': '1px dashed #ccc',
            'min-height': '50px',
            'background-color': '#ffffff',
            'margin-bottom': '10px'
        },
        attributes: {
            class: ''
        }
    },
    section: {
        tag: 'section',
        name: 'Section',
        defaultContent: '',
        defaultStyles: {
            'padding': '40px 20px',
            'background-color': '#f8f9fa',
            'min-height': '100px',
            'margin-bottom': '10px'
        },
        attributes: {
            class: ''
        }
    },
    container: {
        tag: 'div',
        name: 'Container',
        defaultContent: '',
        defaultStyles: {
            'max-width': '1200px',
            'margin': '0 auto',
            'padding': '0 15px',
            'min-height': '50px',
            'border': '1px dotted #999'
        },
        attributes: {
            class: 'container'
        }
    },
    button: {
        tag: 'button',
        name: 'Button',
        defaultContent: 'Click Me',
        defaultStyles: {
            'padding': '10px 20px',
            'background-color': '#007acc',
            'color': 'white',
            'border': 'none',
            'border-radius': '4px',
            'cursor': 'pointer',
            'font-size': '16px',
            'margin': '5px'
        },
        attributes: {
            type: 'button',
            class: 'btn'
        }
    },
    input: {
        tag: 'input',
        name: 'Text Input',
        isVoid: true,
        defaultStyles: {
            'padding': '8px 12px',
            'border': '1px solid #ccc',
            'border-radius': '4px',
            'font-size': '14px',
            'margin': '5px',
            'width': '200px'
        },
        attributes: {
            type: 'text',
            placeholder: 'Enter text...',
            class: 'form-control'
        }
    },
    textarea: {
        tag: 'textarea',
        name: 'Text Area',
        defaultContent: '',
        defaultStyles: {
            'padding': '8px 12px',
            'border': '1px solid #ccc',
            'border-radius': '4px',
            'font-size': '14px',
            'margin': '5px',
            'width': '300px',
            'height': '100px'
        },
        attributes: {
            placeholder: 'Enter long text...',
            class: 'form-control'
        }
    },
    checkbox: {
        tag: 'input',
        name: 'Checkbox',
        isVoid: true,
        defaultStyles: {
            'margin': '5px'
        },
        attributes: {
            type: 'checkbox',
            class: 'form-check-input'
        }
    },
    image: {
        tag: 'img',
        name: 'Image',
        isVoid: true,
        defaultStyles: {
            'max-width': '100%',
            'height': 'auto',
            'display': 'block',
            'margin': '10px 0'
        },
        attributes: {
            src: 'https://via.placeholder.com/300x200',
            alt: 'Placeholder Image',
            class: 'img-fluid'
        }
    },
    video: {
        tag: 'video',
        name: 'Video',
        defaultContent: '',
        defaultStyles: {
            'max-width': '100%',
            'height': 'auto',
            'background-color': '#000'
        },
        attributes: {
            controls: true,
            src: '' // Placeholder needed or empty
        }
    }
};
