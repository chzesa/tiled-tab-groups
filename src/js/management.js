function newGroupsManager() {
	const self = {};
	var overlay = document.getElementById(`overlay-background`);
	var container = document.getElementById(`groups-manager-container`);
	var nodes = [];
	const pool = [];
	var htmlPool = document.getElementById(`pool`);
	var menu = document.getElementById(`groups-manager-menu`);

	let dragged;
	let draggedOver;
	let before;
	let changed = false;

	function dragStart(event) {
		setNodeClass(this, 'drag', true);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/html', 'pvDragging');

		let rect = this.getBoundingClientRect();
		event.dataTransfer.setDragImage(this, rect.width / 2, rect.height / 2);

		dragged = this;
	}

	function dragEnd(event) {
		setNodeClass(this, 'drag', false);
		setNodeClass(view.dragIndicator, 'show', false);
	}

	function dragOver(event) {
		event.preventDefault();

		draggedOver = this;
		before = setDragIndicator(event, this);
	}

	function drop(event) {
		event.stopPropagation();

		let target = GRPINTERFACE.get(this.getAttribute(`id`)).index;
		if (!before) target++;
		let source = GRPINTERFACE.get(dragged.getAttribute(`id`));
		if (source.index < target) {
			target--;
		}

		bgPage.enqueueTask(async function () {
			await GRPINTERFACE.setIndex(source.id, target);
			changed = true;
			await self.update();
		})
	}

	function makeNode(group) {
		var node = pool.pop();

		if (node != null) {
			node.update(group);
			return node;
		}

		node = {};

		node.update = function (group) {
			this.name.innerHTML = '';
			this.name.appendChild(document.createTextNode(group.name));
			setNodeClass(this.elem, `inactive`, group.stash);
			node.elem.setAttribute('id', group.id);
		}

		node.name = new_element(`div`, {
			class: `name`
			, draggable: 'true'
		});

		// node.stash = new_element(`div`, {
		// 	class: 'icon icon-reload'
		// 	, title: 'Toggle stashed state'
		// });

		// node.close = new_element(`div`, {
		// 	class: 'icon icon-close'
		// 	, title: 'Close group'
		// });

		node.elem = new_element(`div`, {
			class: 'tab'
			, style: 'cursor:default'
		}, [node.name]);
		// }, [node.name, node.stash, node.close]);

		node.elem.addEventListener('dragstart', dragStart, false);
		node.elem.addEventListener('dragend', dragEnd, false);
		node.elem.addEventListener('dragover', dragOver, false);
		node.elem.addEventListener('drop', drop, false);

		node.update(group);

		return node;
	}

	self.show = function () {
		setNodeClass(overlay, `hidden`, false);
		self.update();
	}

	self.hide = async function () {
		setNodeClass(overlay, `hidden`, true);
		if (changed) {
			let frag = document.createDocumentFragment();
			await GRPINTERFACE.forEach(function (group) {
				if (group.stash == true) return;
				let node = groupNodes[group.id];
				if (node.group == null) return;
				frag.appendChild(node.group);
			});

			view.groupsNode.appendChild(frag);
		}
		changed = false;
	}

	self.update = async function () {
		var removeFrag = document.createDocumentFragment();
		nodes.forEach(function (node) {
			pool.push(node);
			removeFrag.appendChild(node.elem);
		})

		nodes = [];

		var updateFrag = document.createDocumentFragment();

		await GRPINTERFACE.forEach(function (group) {
			let node = makeNode(group);
			updateFrag.appendChild(node.elem);
			nodes.push(node);
		});

		htmlPool.appendChild(removeFrag);
		container.appendChild(updateFrag);
	}

	{
		let open = document.getElementById(`groups-manager-button`);

		open.addEventListener(`click`, function (event) {
			event.stopPropagation();
			self.show();
		})

		let reload = new_element('div', {
			class: 'icon icon-reload'
			, title: 'Refresh management view'
		, });

		reload.addEventListener(`click`, async function (event) {
			event.stopPropagation();
			await self.update();
		});

		let close = new_element('div', {
			class: 'icon icon-close'
			, title: 'Close management view'
		});

		close.addEventListener(`click`, async function (event) {
			event.stopPropagation();
			await self.hide();
		})

		menu.appendChild(close);
		menu.appendChild(reload);
	}

	return self;
}