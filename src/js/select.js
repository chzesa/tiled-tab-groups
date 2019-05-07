const Selected = (function () {
	let self = {};

	let selectStart = {};
	let pointer = {};
	let lastPointer = {};

	let selectionBox;

	let mouseDown = -1;

	let selectables;
	let selection = {};
	let nextSelection = {};
	let getSelectables = () => [];
	let selectables_need_update = true;

	function update () {
		let x = pointer.x < selectStart.x ? pointer.x : selectStart.x;
		let y = pointer.y < selectStart.y ? pointer.y : selectStart.y;
		let w = Math.abs(pointer.x - selectStart.x);
		let h = Math.abs(pointer.y - selectStart.y);
		updateSelectionVisual(x, y, w, h);
		updateSelection(x, y, w, h);
	}

	function updateSelection (x, y, w, h) {
		for (let id in selectables) {
			let elem = selectables[id];

			let inSelection = isElementPartInRect(elem, x, y, w, h);

			let outcome = false;

			if (inSelection && elementVisibleInScrollfield(elem, elem.parentNode.parentNode)) {
				outcome = true;
			}

			nextSelection[id] = outcome;
			let previous = selection[id];

			if (outcome || previous) {
				outcome = true;
			}

			if (previous != outcome) {
				setNodeClass(elem, 'selection', outcome);
			}
		}
	}

	function elementVisibleInScrollfield (elem, scrollfield) {
		// Only tests vertical scroll
		let offset = elem.offsetTop;
		let scrollTop = scrollfield.scrollTop;

		if (offset + elem.clientHeight - scrollTop > 0 &&
			offset - scrollTop < scrollfield.clientHeight) {
			return true;
		}
	}

	function updateSelectionVisual (x, y, w, h) {
		selectionBox.style.left = `${x}px`;
		selectionBox.style.top = `${y}px`;
		selectionBox.style.width = `${w}px`;
		selectionBox.style.height = `${h}px`;
	}

	function updateSelectionItemVisual () {
		for (let id in selectables) {
			let elem = selectables[id];
			setNodeClass(elem, 'selection', selection[id]);
		}
	}

	function onStartSelect (event) {
		selectStart.x = event.clientX;
		selectStart.y = event.clientY;
		selectionBox.style.left = `${event.clientX}px`;
		selectionBox.style.top = `${event.clientY}px`;
		selectionBox.style.display = 'initial';
	}

	function onEndSelect () {
		selectionBox.style.display = 'none';
		selectionBox.style.width = `$0px`;
		selectionBox.style.height = `$0px`;

		for (let id in nextSelection) {
			let outcome = nextSelection[id];
			let previous = selection[id];

			selection[id] = outcome || previous;
		}

		nextSelection = {};
	}

	function ensureUpToDate () {
		if (selectables_need_update) {
			selectables = getSelectables();
			selectables_need_update = false;
		}
	}

	function endSelect () {
		if (mouseDown != -1) {
			clearInterval(mouseDown)
			mouseDown = -1;
			onEndSelect();
		}
	}

	self.get = function () {
		let r = [];

		for (id in selection) {
			if (selection[id] == true) {
				r.push(Number(id));
			}
		}

		endSelect();

		return r;
	}

	self.add = function (id) {
		ensureUpToDate();
		let elem = selectables[id];
		if (elem != null) {
			selection[id] = true;
			setNodeClass(elem, 'selection', true);
		}
	}

	self.remove = function (id) {
		let elem = selectables[id];
		if (elem != null) {
			selection[id] = false;
			setNodeClass(elem, 'selection', false);
		}
	}

	self.removeSelectable = function (id) {
		let elem = selectables[id];
		if (elem != null) {
			delete selection[id];
			delete selectables[id];
			setNodeClass(elem, 'selection', false);
			selectables_need_update = true;
		}
	}

	self.requireUpdate = function () {
		selectables_need_update = true;
	}

	self.print = function () {
		let s = self.get();

		for (let id in s) {
			console.log(id);
		}
	}

	self.clear = function () {
		selection = {};
		updateSelectionItemVisual();
	}

	self.startSelect = function(event) {
		if (event.button != 0) {
			return;
		}

		event.stopPropagation();

		if (mouseDown == -1) {
			if (!event.ctrlKey && !event.shiftKey) {
				self.clear();
			}

			ensureUpToDate();

			mouseDown = setInterval(function() {
				if (lastPointer.x != pointer.x || lastPointer.y != pointer.y) {
					update();
					lastPointer.x = pointer.x;
					lastPointer.y = pointer.y;
				}
			}, 17);

			onStartSelect(event);
			update();
		}
	}

	self.init = function (callback) {
		if (callback != null) {
			getSelectables = callback;
		}

		selectionBox = document.getElementById('selection-box');
		selectables = getSelectables();

		document.onmouseup = function (event) {
			if (event.button != 0) {
				return;
			}
			endSelect();
		}

		document.onmousemove = function (event) {
			pointer.x = event.clientX;
			pointer.y = event.clientY;
		}

		document.onkeypress = function (event) {
			if (event.key == 'd') {
				event.stopPropagation();
				self.clear();
			}
		}
	}

	return self;
})();