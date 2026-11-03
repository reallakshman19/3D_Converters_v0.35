export function createElement(tag, text = '', className = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function createOption(value, text, selected = false) {
  const option = createElement('option', text);
  option.value = value;
  option.selected = selected;
  return option;
}

export function appendLabeledControl(parent, labelText, control) {
  const label = createElement('label');
  label.append(labelText + ' ', control);
  parent.appendChild(label);
  return control;
}

export function createPre(text) {
  return createElement('pre', String(text || ''));
}

export function lineCount(text) {
  return text ? String(text).split(/\r\n|\r|\n/).length : 0;
}

export function clearElement(element) {
  element.innerHTML = '';
}

export function downloadTextFile(name, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([String(text || '')], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name || 'xml-cii-2019-output.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}
