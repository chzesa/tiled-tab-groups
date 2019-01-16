'use strict';

var dragTab = null;
var dragOverTab = null;
var dragCount = 0;
var dragDropBefore;

function tabDragStart(e) {
	if (e.ctrlKey) {
		return;
	}

	if (this.parentNode == groupNodes.pinned.content) {
		e.preventDefault();
		return;
	}

	this.classList.add('drag');

	e.dataTransfer.effectAllowed = 'move';
	e.dataTransfer.setData('text/html', 'pvDragging');

	var rect = this.getBoundingClientRect();

	e.dataTransfer.setDragImage(this, rect.width / 2, rect.height / 2);

	dragTab = this;

	if (Selected.get().length == 0) {
		Selected.add(Number(this.getAttribute('tabId')));
	}
}

function tabDragEnter(e) {
	e.preventDefault();

	if (dragOverTab && this != dragOverTab) {
		view.dragIndicator.classList.remove('show');
		dragOverTab = this;
	}

	if (dragCount == 0) {
		dragOverTab = this;
	}
	dragCount++;
}

function tabDragLeave(e) {
	e.preventDefault();

	dragCount--;
	if (dragCount == 0) {
		view.dragIndicator.classList.remove('show');
		dragOverTab = null;
	}
}

function tabDragOver(e) {
	e.preventDefault();

	e.dataTransfer.dropEffect = 'move'; // See the section on the DataTransfer object.

	if (dragOverTab && dragTab != dragOverTab) {
		var rect = dragOverTab.getBoundingClientRect();

		view.dragIndicator.classList.add('show');
		view.dragIndicator.style.width = `${rect.width}px`;
		view.dragIndicator.style.left = (rect.left) + 'px';

		if (e.clientY < window.scrollY + rect.top + (rect.height / 2)) {
			view.dragIndicator.style.top = (window.scrollY + rect.top - 1) + 'px';
			dragDropBefore = true;
		}
		else {
			let yOffset = window.scrollY + rect.top + rect.height - 1;
			view.dragIndicator.style.top = yOffset + 'px';
			dragDropBefore = false;
		}
	}

	return false;
}

async function tabDrop(e) {
	e.stopPropagation();

	if (dragTab !== dragOverTab && !dragOverTab.classList.contains('selection')) {

		if (this.parentNode == groupNodes.pinned.content) {
			e.preventDefault();
			return;
		}

		dropSelectedNodesToGroup();

		var toTabId = Number(dragOverTab.getAttribute('tabId'));
		var groupId = await tabs.getGroupId(toTabId);

		var tabId = Number(dragTab.getAttribute('tabId'));

		var tab = await browser.tabs.get(tabId);
		var toTab = await browser.tabs.get(toTabId);

		var toIndex = Number(toTab.index);

		if (tab.index < toTab.index) {
			if (dragDropBefore) {
				toIndex--;
			}
		}
		else {
			if (!dragDropBefore) {
				toIndex++;
			}
		}

		moveTabsToGroup(Selected.get(), groupId, toIndex);
	}

	return false;
}

async function dropSelectedNodesToGroup() {
	let frag = document.createDocumentFragment();

	Selected.get().forEach(id => {
		frag.appendChild(tabNodes[`${id}`].tab);
	});

	let parent = dragOverTab.parentNode;
	for (let i = 0; i < parent.children.length; i++) {
		if (dragOverTab == parent.children[i]) {
			let insertAt = dragDropBefore ? i : i + 1;
			setAsNthChild(frag, parent, insertAt);
			break;
		}
	}

	groups.forEach(function (group) {
		// updateTabCount(group);
		markGroupRecount(group.id);
	});
}

async function moveTabsToGroup(pTabIdArray, pGroupId, pIndex) {
	Selected.clear();
	pTabIdArray.forEach(id => {
		tabs.setGroupId(id, pGroupId);
	});
	tabs.toggleAll();

	browser.tabs.onMoved.removeListener(tabMoved);

	await browser.tabs.move(pTabIdArray, {
		index: pIndex
	});

	browser.tabs.onMoved.addListener(tabMoved);

	pTabIdArray.forEach(id => {
		updateIndent(id);
	});
}

function groupDragOver(e) {
	e.preventDefault(); // Necessary. Allows us to drop.

	e.dataTransfer.dropEffect = 'move'; // See the section on the DataTransfer object.

	return false;
}

async function putTabInGroup(groupId) {
	let frag = document.createDocumentFragment();

	Selected.get().forEach(id => {
		frag.appendChild(tabNodes[`${id}`].tab);
	});

	groups.forEach(function (group) {
		// updateTabCount(group);
		markGroupRecount(group.id);
	});

	setAsNthChild(frag, groupNodes[groupId].content, Number(groupNodes[groupId].tabCount.innerHTML));

	moveTabsToGroup(Selected.get(), groupId, -1);
}

async function groupDrop(e) {
	e.stopPropagation();

	var groupId = Number(this.getAttribute('groupId'));

	putTabInGroup(groupId);

	return false;
}

async function outsideDrop(e) {
	e.stopPropagation();

	const group = await groups.create();

	makeGroupNode(group);

	view.groupsNode.appendChild(groupNodes[group.id].group);

	putTabInGroup(group.id);

	return false;
}

function tabDragEnd(e) {
	dragCount = 0;
	this.classList.remove('drag');
	view.dragIndicator.classList.remove('show');
}