const fs = require('fs');
const path = require('path');
const ExpressionParser = require('./expressionParser');

/**
 * Strips CSS comments (/* ... *\/) from a CSS string, taking care not to touch comments within quoted strings.
 * @param {string} css - The CSS string.
 * @returns {string} The CSS string without comments.
 */
function stripCssComments(css) {
    let result = '';
    let inString = null; // null, '"', or "'"
    let i = 0;
    while (i < css.length) {
        const char = css[i];
        const nextChar = css[i + 1];

        if (inString) {
            result += char;
            if (char === '\\') {
                if (i + 1 < css.length) {
                    result += css[i + 1];
                    i += 2;
                    continue;
                }
            } else if (char === inString) {
                inString = null;
            }
            i++;
        } else {
            if (char === '/' && nextChar === '*') {
                // Start of comment
                i += 2;
                while (i < css.length) {
                    if (css[i] === '*' && css[i + 1] === '/') {
                        i += 2;
                        break;
                    }
                    i++;
                }
            } else {
                if (char === '"' || char === "'") {
                    inString = char;
                }
                result += char;
                i++;
            }
        }
    }
    return result;
}

/**
 * ComponentParser handles the parsing of Avenx component files (.js and .css).
 * It extracts component state, computed properties, methods, and templates,
 * and coordinates with the StyleProcessor to handle styles.
 */
class ComponentParser {
    /**
     * @param {StyleProcessor} styleProcessor - An instance of StyleProcessor to handle styles.
     */
    constructor(styleProcessor) {
        /** @type {StyleProcessor} */
        this.styleProcessor = styleProcessor;
        /** @type {ExpressionParser} */
        this.expressionParser = new ExpressionParser();
    }

    /**
     * Parses a .component.js or .page.js file and its corresponding CSS file.
     * @param {string} filePath - The absolute path to the file.
     * @param {'component'|'page'} [type='component'] - The type of file being parsed.
     * @returns {string} The generated JavaScript class.
     */
    parse(filePath, type = 'component') {
        const isPage = type === 'page';
        const suffix = isPage ? '.page.js' : '.component.js';
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(filePath, suffix);
        
        // Convert user-profile or user_profile to UserProfile
        const name = fileName
            .split(/[-_]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');

        const desPath = filePath.replace(suffix, isPage ? '.page.css' : '.component.css');
        let desBlocks = {};

        if (fs.existsSync(desPath)) {
            this.extractStylesAndVars(fs.readFileSync(desPath, 'utf-8'), desBlocks);
        }

        const state = this.extractState(content);
        const computed = this.extractComputed(content);
        const methods = this.extractMethods(content);
        let template = this.extractTemplate(content, desBlocks, name, filePath, state, computed, methods);

        // Handle declarative tags: <MyComponent /> or <MyComponent>...</MyComponent> -> <div data-avenx-comp="MyComponent">...</div>
        // Only if it looks like a component (starts with uppercase)
        template = this.processComponentTags(template);

        const methodStrings = Object.entries(methods)
            .map(([k, v]) => `${k}: \`${v}\``).join(',\n        ');

        if (isPage) {
            return `
class ${name} extends AvenxPage {
    constructor(bridges, componentRegistry, props) {
        super(${JSON.stringify(state)}, ${JSON.stringify(computed)}, bridges, \`${template}\`, { ${methodStrings} }, componentRegistry, props);
    }
}`;
        }

        return `
class ${name} extends AvenxComponent {
    constructor(bridges, props) {
        super(${JSON.stringify(state)}, ${JSON.stringify(computed)}, bridges, \`${template}\`, { ${methodStrings} }, props);
    }
}`;
    }

    /**
     * Extracts global CSS variables and component-specific style blocks from CSS content.
     * @param {string} desContent - The content of the .component.css file.
     * @param {Object} desBlocks - An object to store the extracted style blocks.
     * @private
     */
    extractStylesAndVars(desContent, desBlocks) {
        const globalMatch = desContent.match(/<@global>([\s\S]*?)<\/ ?@global>/i);
        if (globalMatch) {
            let inner = globalMatch[1];
            const defRegex = /@def\s+([\w-]+)\s+([^;]+);/g;
            let defMatch;
            while ((defMatch = defRegex.exec(inner)) !== null) {
                this.styleProcessor.addVariable(defMatch[1], defMatch[2].trim());
            }
            
            // Remove @def lines and add the rest as global CSS
            const rawCss = inner.replace(/@def\s+[\w-]+\s+[^;]+;/g, '').trim();
            if (rawCss) {
                this.styleProcessor.addGlobalCSS(rawCss);
            }
        }

        const cssBlockMatch = desContent.match(/<@css>([\s\S]*?)<\/ ?@css>/i);
        if (cssBlockMatch) {
            const inner = stripCssComments(cssBlockMatch[1]);
            let depth = 0, currentName = "", currentBody = "", inBlock = false;
            let inString = null;
            for (let i = 0; i < inner.length; i++) {
                const char = inner[i];
                if (inString) {
                    let toAppend = char;
                    let nextToAppend = "";
                    if (char === '\\') {
                        if (i + 1 < inner.length) {
                            nextToAppend = inner[i + 1];
                            i++;
                        }
                    } else if (char === inString) {
                        inString = null;
                    }
                    if (inBlock) {
                        currentBody += toAppend + nextToAppend;
                    }
                } else {
                    if (char === '"' || char === "'") {
                        inString = char;
                        if (inBlock) {
                            currentBody += char;
                        }
                    } else if (char === '{' && depth === 0) {
                        currentName = inner.substring(0, i).trim().split('}').pop().trim();
                        inBlock = true; depth++;
                    } else if (char === '{') {
                        depth++; currentBody += char;
                    } else if (char === '}') {
                        depth--;
                        if (depth === 0) {
                            if (currentName) desBlocks[currentName] = currentBody.trim();
                            currentBody = ""; currentName = ""; inBlock = false;
                        } else { currentBody += char; }
                    } else if (inBlock) { currentBody += char; }
                }
            }
        }
    }

    /**
     * Extracts the initial state from the component's <state /> tags.
     * @param {string} content - The content of the .component.js file.
     * @returns {Object} The extracted state object.
     * @private
     */
    extractState(content) {
        return this.expressionParser.parseState(content);
    }

    /**
     * Extracts computed properties from the component's <computed /> tags.
     * @param {string} content - The content of the .component.js file.
     * @returns {Object} A map of property names to their expression strings.
     * @private
     */
    extractComputed(content) {
        return this.expressionParser.parseComputed(content);
    }

    /**
     * Extracts actions (methods) from the component's <action /> tags.
     * @param {string} content - The content of the .component.js file.
     * @returns {Object<string, string>} A map of method names to their stringified bodies.
     * @private
     */
    extractMethods(content) {
        return this.expressionParser.parseMethods(content);
    }

    /**
     * Extracts the HTML template and processes internal styles.
     * @param {string} content - The content of the .component.js file.
     * @param {Object} desBlocks - The previously extracted design blocks.
     * @param {string} name - The name of the component for style hashing.
     * @param {string} [filePath] - The component file path.
     * @param {Object} [state] - The extracted state keys.
     * @param {Object} [computed] - The extracted computed keys.
     * @param {Object} [methods] - The extracted method keys.
     * @returns {string} The cleaned and processed HTML template.
     * @private
     */
    extractTemplate(content, desBlocks, name, filePath, state, computed, methods) {
        let template = content
            .replace(/<state.*? \/>/g, '')
            .replace(/<computed.*? \/>/g, '')
            .replace(/<action.*?>[\s\S]*?<\/action>/g, '')
            .trim();
        template = this.styleProcessor.process(template, desBlocks, name);
        template = this.processBindDirectives(template);
        if (filePath && state && computed && methods) {
            this.validateTemplate(template, state, computed, methods, filePath);
        }
        template = this.processForLoops(template);
        return template.split('\n').filter(line => line.trim() !== '').join('\n');
    }

    /**
     * Performs compile-time validation on template expressions to ensure
     * all referenced variables and methods are declared.
     * @param {string} template - The template string (after data-ax-bind translation).
     * @param {Object} state - The extracted state keys.
     * @param {Object} computed - The extracted computed keys.
     * @param {Object} methods - The extracted method keys.
     * @param {string} filePath - The component file path.
     * @private
     */
    validateTemplate(template, state, computed, methods, filePath) {
        const declared = new Set([
            ...Object.keys(state),
            ...Object.keys(computed),
            ...Object.keys(methods)
        ]);

        const bridges = this.findBridgeNames(filePath);
        bridges.forEach(b => declared.add(b));

        const EXCLUDED_IDENTIFIERS = new Set([
            'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
            'this', 'let', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'in', 'of',
            'new', 'typeof', 'instanceof', 'class', 'extends', 'try', 'catch', 'finally', 'throw',
            'await', 'async', 'import', 'export', 'default', 'delete', 'void', 'do', 'while', 'switch',
            'case', 'break', 'continue', 'debugger', 'yield', 'with', 'arguments',
            'console', 'Math', 'JSON', 'window', 'document', 'Array', 'Object', 'String', 'Number',
            'Boolean', 'Date', 'Error', 'Map', 'Set', 'Promise', 'props', 'event', 'args'
        ]);

        const events = [];

        // 1. Find loop starts and ends
        const forStartRegex = /<@for\s+(\w+)\s+in\s+([^>]+?)(?:\s+key="([^"]*)")?>/gi;
        let match;
        while ((match = forStartRegex.exec(template)) !== null) {
            events.push({
                type: 'loop_start',
                index: match.index,
                length: match[0].length,
                item: match[1],
                list: match[2]
            });
        }

        const forEndRegex = /<\/ ?@for>/gi;
        while ((match = forEndRegex.exec(template)) !== null) {
            events.push({
                type: 'loop_end',
                index: match.index,
                length: match[0].length
            });
        }

        // 2. Find interpolations
        const interpRegex = /\{\{([\s\S]*?)\}\}/g;
        while ((match = interpRegex.exec(template)) !== null) {
            events.push({
                type: 'interpolation',
                index: match.index,
                length: match[0].length,
                expr: match[1]
            });
        }

        // 3. Find event attributes in any tag
        const tagRegex = /<([a-zA-Z0-9@/!-][^>]*?)>/g;
        while ((match = tagRegex.exec(template)) !== null) {
            const tagIndex = match.index;
            const attrRegex = /@([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(match[0])) !== null) {
                events.push({
                    type: 'event',
                    index: tagIndex + attrMatch.index,
                    length: attrMatch[0].length,
                    expr: attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3]
                });
            }
        }

        events.sort((a, b) => a.index - b.index);

        const currentLoopVars = [];
        const filename = path.basename(filePath);

        const checkIdentifiers = (expr) => {
            const ids = this.extractRootIdentifiers(expr);
            for (const id of ids) {
                if (EXCLUDED_IDENTIFIERS.has(id)) {
                    continue;
                }
                if (currentLoopVars.includes(id)) {
                    continue;
                }
                if (!declared.has(id)) {
                    console.warn(`[Avenx Validation Warning] Undeclared variable or method "${id}" referenced in template of ${filename}.`);
                }
            }
        };

        for (const ev of events) {
            if (ev.type === 'loop_start') {
                checkIdentifiers(ev.list);
                currentLoopVars.push(ev.item);
            } else if (ev.type === 'loop_end') {
                currentLoopVars.pop();
            } else if (ev.type === 'interpolation' || ev.type === 'event') {
                checkIdentifiers(ev.expr);
            }
        }
    }

    /**
     * Extracts root variable and method identifiers from a JS expression string.
     * @param {string} code - The Javascript expression/statement.
     * @returns {string[]} The list of root identifiers.
     * @private
     */
    extractRootIdentifiers(code) {
        const identifiers = new Set();
        let i = 0;
        let hasQuestionMark = false;

        while (i < code.length) {
            const char = code[i];

            if (char === '/' && code[i + 1] === '/') {
                i += 2;
                while (i < code.length && code[i] !== '\n') i++;
                continue;
            }

            if (char === '/' && code[i + 1] === '*') {
                i += 2;
                while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
                i += 2;
                continue;
            }

            if (char === "'") {
                i++;
                while (i < code.length && code[i] !== "'") {
                    if (code[i] === '\\') i++;
                    i++;
                }
                i++;
                continue;
            }

            if (char === '"') {
                i++;
                while (i < code.length && code[i] !== '"') {
                    if (code[i] === '\\') i++;
                    i++;
                }
                i++;
                continue;
            }

            if (char === '`') {
                i++;
                while (i < code.length && code[i] !== '`') {
                    if (code[i] === '\\') i++;
                    if (code[i] === '$' && code[i + 1] === '{') {
                        let depth = 1;
                        let j = i + 2;
                        while (j < code.length && depth > 0) {
                            if (code[j] === '{') depth++;
                            else if (code[j] === '}') depth--;
                            j++;
                        }
                        const subExpr = code.substring(i + 2, j - 1);
                        this.extractRootIdentifiers(subExpr).forEach(id => identifiers.add(id));
                        i = j - 1;
                    }
                    i++;
                }
                i++;
                continue;
            }

            const idRegex = /^[A-Za-z_$][\w$]*/;
            const sub = code.substring(i);
            const match = sub.match(idRegex);
            if (match) {
                const name = match[0];

                let isProperty = false;
                let checkIdx = i - 1;
                while (checkIdx >= 0 && /\s/.test(code[checkIdx])) {
                    checkIdx--;
                }
                if (checkIdx >= 0 && code[checkIdx] === '.') {
                    isProperty = true;
                } else if (checkIdx >= 1 && code[checkIdx] === '.' && code[checkIdx - 1] === '?') {
                    isProperty = true;
                }

                let nextIdx = i + name.length;
                while (nextIdx < code.length && /\s/.test(code[nextIdx])) {
                    nextIdx++;
                }
                let isObjectKey = false;
                if (nextIdx < code.length && code[nextIdx] === ':') {
                    if (!hasQuestionMark) {
                        isObjectKey = true;
                    } else {
                        hasQuestionMark = false;
                    }
                }

                if (!isProperty && !isObjectKey) {
                    identifiers.add(name);
                }

                i += name.length;
                continue;
            }

            if (char === '?') {
                if (code[i + 1] === '.') {
                    i += 2;
                    continue;
                }
                hasQuestionMark = true;
            }

            if (char === ';' || char === ',' || char === '{' || char === '(' || char === '[') {
                hasQuestionMark = false;
            }

            i++;
        }

        return Array.from(identifiers);
    }

    /**
     * Resolves all bridge names in the src/global folder relative to a file.
     * @param {string} filePath - The absolute file path of the component.
     * @returns {Set<string>} The set of bridge names.
     * @private
     */
    findBridgeNames(filePath) {
        const bridgeNames = new Set();
        if (!filePath) return bridgeNames;
        try {
            let currentDir = path.resolve(path.dirname(filePath));
            while (currentDir) {
                const globalDir = path.join(currentDir, 'global');
                if (fs.existsSync(globalDir) && fs.statSync(globalDir).isDirectory()) {
                    fs.readdirSync(globalDir).forEach(file => {
                        if (file.endsWith('.bridge.js')) {
                            const name = path.basename(file, '.bridge.js');
                            const capitalizedName = name.split(/[-_]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join("") + "Bridge";
                            bridgeNames.add(capitalizedName);
                        }
                    });
                    break;
                }
                const srcGlobalDir = path.join(currentDir, 'src', 'global');
                if (fs.existsSync(srcGlobalDir) && fs.statSync(srcGlobalDir).isDirectory()) {
                    fs.readdirSync(srcGlobalDir).forEach(file => {
                        if (file.endsWith('.bridge.js')) {
                            const name = path.basename(file, '.bridge.js');
                            const capitalizedName = name.split(/[-_]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join("") + "Bridge";
                            bridgeNames.add(capitalizedName);
                        }
                    });
                    break;
                }
                const parent = path.dirname(currentDir);
                if (parent === currentDir) {
                    break;
                }
                currentDir = parent;
            }
        } catch (e) {
            // Ignore directory scanning errors
        }
        return bridgeNames;
    }

    /**
     * Processes data-ax-bind attributes on input, textarea, and select elements.
     * Converts data-ax-bind="expr" to value="{{ expr }}" and event listener.
     * @param {string} template - The template string.
     * @returns {string} The processed template.
     */
    processBindDirectives(template) {
        const tagRegex = /<(input|textarea|select)\b([^>]*?)>/gi;
        return template.replace(tagRegex, (match, tagName, attrs) => {
            const bindRegex = /\bdata-ax-bind\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
            const bindMatch = attrs.match(bindRegex);
            if (!bindMatch) {
                return match;
            }
            
            const bindExpr = (bindMatch[1] !== undefined ? bindMatch[1] : bindMatch[2]).trim();
            let cleanAttrs = attrs.replace(bindRegex, '').trim();
            
            let isSelfClosing = false;
            if (cleanAttrs.endsWith('/')) {
                isSelfClosing = true;
                cleanAttrs = cleanAttrs.slice(0, -1).trim();
            }
            
            const eventName = tagName.toLowerCase() === 'select' ? 'change' : 'input';
            const valueAttr = `value="{{ ${bindExpr} }}"`;
            const eventAttr = `@${eventName}="${bindExpr} = event.target.value"`;
            
            const suffix = isSelfClosing ? ' />' : '>';
            return `<${tagName} ${cleanAttrs} ${valueAttr} ${eventAttr}`.trim().replace(/\s+/g, ' ') + suffix;
        });
    }

    /**
     * Processes <@for> loops in the template, converting them to <template> tags
     * that can be handled by the runtime for efficient list rendering.
     * @param {string} template - The HTML template string.
     * @returns {string} The processed template.
     * @private
     */
    processForLoops(template) {
        let currentTemplate = template;

        while (true) {
            // Matches <@for item in list> or <@for item in list key="item.id">, or closing tag </@for> / </ @for>
            const tagRegex = /(<@for\s+(\w+)\s+in\s+([^>]+?)(?:\s+key="([^"]*)")?>)|(<\/ ?@for>)/gi;
            let match;
            const tags = [];
            while ((match = tagRegex.exec(currentTemplate)) !== null) {
                if (match[1]) {
                    tags.push({
                        type: 'start',
                        index: match.index,
                        length: match[0].length,
                        item: match[2],
                        list: match[3],
                        key: match[4]
                    });
                } else {
                    tags.push({
                        type: 'end',
                        index: match.index,
                        length: match[0].length
                    });
                }
            }

            if (tags.length === 0) {
                break;
            }

            let innerPair = null;
            const stack = [];
            for (let i = 0; i < tags.length; i++) {
                const tag = tags[i];
                if (tag.type === 'start') {
                    stack.push(tag);
                } else {
                    const startTag = stack.pop();
                    if (startTag) {
                        innerPair = { start: startTag, end: tag };
                        break; // Found innermost loop!
                    }
                }
            }

            if (!innerPair) {
                console.warn("[ComponentParser] Unmatched <@for> tags in template.");
                break;
            }

            const startIdx = innerPair.start.index;
            const endIdx = innerPair.end.index + innerPair.end.length;

            const bodyStart = startIdx + innerPair.start.length;
            const bodyEnd = innerPair.end.index;
            const body = currentTemplate.substring(bodyStart, bodyEnd);

            // Escape inner interpolation tags to prevent them from being processed
            // by the initial template render. They will be processed per-item at runtime.
            const escapedBody = body.replace(/\{\{/g, '{%').replace(/\}\}/g, '%}');
            let attrs = `data-ax-for="${innerPair.start.list.trim()}" data-ax-as="${innerPair.start.item.trim()}"`;
            if (innerPair.start.key) {
                attrs += ` data-ax-key="${innerPair.start.key.trim()}"`;
            }

            const replacement = `<template ${attrs}>${escapedBody}</template>`;
            currentTemplate = currentTemplate.substring(0, startIdx) + replacement + currentTemplate.substring(endIdx);
        }

        return currentTemplate;
    }

    /**
     * Processes component tags recursively to handle transclusion slots.
     * Maps `<CompName ...>...</CompName>` to `<div data-avenx-comp="CompName">...</div>`.
     * @param {string} template - The template string.
     * @returns {string} The processed template.
     */
    processComponentTags(template) {
        let currentTemplate = template;
        
        while (true) {
            // Find the first occurrence of < followed by an uppercase letter
            const match = currentTemplate.match(/<([A-Z][a-zA-Z0-9]*)\b/);
            if (!match) {
                break;
            }
            
            const compName = match[1];
            const startIndex = match.index;
            
            // Find the end of this opening/self-closing tag
            let i = startIndex + 1 + compName.length;
            let inQuote = null;
            let isSelfClosing = false;
            let tagEndIndex = -1;
            
            while (i < currentTemplate.length) {
                const char = currentTemplate[i];
                if (inQuote) {
                    if (char === inQuote) {
                        inQuote = null;
                    }
                } else if (char === '"' || char === "'") {
                    inQuote = char;
                } else if (char === '>') {
                    const trimmedBefore = currentTemplate.substring(startIndex + 1 + compName.length, i).trim();
                    if (trimmedBefore.endsWith('/')) {
                        isSelfClosing = true;
                    }
                    tagEndIndex = i + 1;
                    break;
                }
                i++;
            }
            
            if (tagEndIndex === -1) {
                break; // Malformed tag, stop parsing to prevent infinite loops
            }
            
            // Extract the attributes string
            let attrsStr = currentTemplate.substring(startIndex + 1 + compName.length, tagEndIndex - 1).trim();
            if (isSelfClosing && attrsStr.endsWith('/')) {
                attrsStr = attrsStr.slice(0, -1).trim();
            }
            
            // Parse attributes
            const props = [];
            const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
                const attrName = attrMatch[1];
                const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3];
                
                let propExpr;
                if (attrVal.startsWith('{{') && attrVal.endsWith('}}')) {
                    propExpr = attrVal.slice(2, -2).trim();
                } else {
                    const trimmed = attrVal.trim();
                    if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || (trimmed !== '' && !isNaN(trimmed))) {
                        propExpr = trimmed;
                    } else {
                        propExpr = `'${trimmed.replace(/'/g, "\\'")}'`;
                    }
                }
                props.push(`data-props-${attrName}="${propExpr}"`);
            }
            const propsAttr = props.length > 0 ? ` ${props.join(' ')}` : '';
            
            if (isSelfClosing) {
                const replacement = `<div data-avenx-comp="${compName}"${propsAttr}></div>`;
                currentTemplate = currentTemplate.substring(0, startIndex) + replacement + currentTemplate.substring(tagEndIndex);
            } else {
                // Find matching closing tag </CompName>
                let searchIndex = tagEndIndex;
                let depth = 1;
                let closingTagIndex = -1;
                let closingTagLength = 0;
                
                while (searchIndex < currentTemplate.length) {
                    const nextOpen = currentTemplate.substring(searchIndex).match(new RegExp(`^<${compName}\\b`));
                    const nextClose = currentTemplate.substring(searchIndex).match(new RegExp(`^</\\s*${compName}\\s*>`));
                    
                    if (nextClose) {
                        depth--;
                        if (depth === 0) {
                            closingTagIndex = searchIndex;
                            closingTagLength = nextClose[0].length;
                            break;
                        }
                        searchIndex += nextClose[0].length;
                    } else if (nextOpen) {
                        // Scan to end of this open tag to see if it is self-closing
                        let tempIdx = searchIndex + nextOpen[0].length;
                        let tempInQuote = null;
                        let tempIsSelfClosing = false;
                        while (tempIdx < currentTemplate.length) {
                            const tc = currentTemplate[tempIdx];
                            if (tempInQuote) {
                                if (tc === tempInQuote) tempInQuote = null;
                            } else if (tc === '"' || tc === "'") {
                                tempInQuote = tc;
                            } else if (tc === '>') {
                                const trimmedBefore = currentTemplate.substring(searchIndex + nextOpen[0].length, tempIdx).trim();
                                if (trimmedBefore.endsWith('/')) {
                                    tempIsSelfClosing = true;
                                }
                                tempIdx++;
                                break;
                            }
                            tempIdx++;
                        }
                        if (!tempIsSelfClosing) {
                            depth++;
                        }
                        searchIndex = tempIdx;
                    } else {
                        searchIndex++;
                    }
                }
                
                if (closingTagIndex === -1) {
                    // No matching closing tag, treat as self-closing
                    const replacement = `<div data-avenx-comp="${compName}"${propsAttr}></div>`;
                    currentTemplate = currentTemplate.substring(0, startIndex) + replacement + currentTemplate.substring(tagEndIndex);
                } else {
                    const innerContent = currentTemplate.substring(tagEndIndex, closingTagIndex);
                    // Recursively process tags inside innerContent
                    const processedInner = this.processComponentTags(innerContent);
                    const replacement = `<div data-avenx-comp="${compName}"${propsAttr}>${processedInner}</div>`;
                    currentTemplate = currentTemplate.substring(0, startIndex) + replacement + currentTemplate.substring(closingTagIndex + closingTagLength);
                }
            }
        }
        return currentTemplate;
    }
}

module.exports = ComponentParser;
