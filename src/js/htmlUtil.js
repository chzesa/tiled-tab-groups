function new_element(name, attributes, children) {

	const e = document.createElement(name);

	for (const key in attributes) {
		if (key == 'content') {
			e.appendChild(document.createTextNode(attributes[key]));
		}
		else {
			e.setAttribute(key.replace(/_/g, '-'), attributes[key]);
		}
	}

	for (const child of children || []) {
		e.appendChild(child);
	}

	return e;
}

function setNodeClass(node, cl, state) {
	if (node.classList.contains(cl) != state) {
		if (state) {
			node.classList.add(cl);
		}
		else {
			node.classList.remove(cl);
		}
	}
}

function setAsNthChild(child, parent, nth = 0) {
	if (nth < parent.children.length) {
		parent.insertBefore(child, parent.children[nth]);
	}
	else {
		parent.appendChild(child);
	}
}

async function appendCSS(pCSS) {
	let css = document.createElement('style');
	css.type = 'text/css';
	css.innerHTML = pCSS;
	document.body.appendChild(css);
}

async function appendCSSFile(file) {
	let link = document.createElement('link');
	link.rel = 'stylesheet';
	link.type = 'text/css';
	link.href = file;
	document.getElementsByTagName('head')[0].appendChild(link);
}

function isElementPartInRect(pElement, pX, pY, pWidth, pHeight) {
	let rect = pElement.getBoundingClientRect();

	if (pX > rect.x + rect.width ||
		pX + pWidth < rect.x ||
		pY > rect.y + rect.height ||
		pY + pHeight < rect.y) {
		return false;
	}

	return true;
}

function isPointInRect(pPointX, pPointY, pX, pY, pWidth, pHeight) {
	if (pPointX >= pX && pPointY >= pY && pPointX <= pX + pWidth && pPointY <= pY + pHeight) {
		return true;
	}

	return false;
}