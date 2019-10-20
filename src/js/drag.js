'use strict';

var dragTab = null;
var dragOverTab = null;
var dragCount = 0;
var dragDropBefore;

function tabDragStart(e) {
	if (e.ctrlKey || e.shiftKey) {
		return;
	}

	if (this.parentNode == pinned.content) {
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

	bgPage.setSelectionSourceWindow(WINDOW_ID);
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

function setDragIndicator(event, element) {
	var rect = element.getBoundingClientRect();

	view.dragIndicator.classList.add('show');
	view.dragIndicator.style.width = `${rect.width}px`;
	view.dragIndicator.style.left = (rect.left) + 'px';

	if (event.clientY < window.scrollY + rect.top + (rect.height / 2)) {
		view.dragIndicator.style.top = (window.scrollY + rect.top - 1) + 'px';
		return true;
	}
	else {
		let yOffset = window.scrollY + rect.top + rect.height - 1;
		view.dragIndicator.style.top = yOffset + 'px';
		return false;
	}
}

function tabDragOver(e) {
	e.preventDefault();

	e.dataTransfer.dropEffect = 'move'; // See the section on the DataTransfer object.

	if (dragOverTab && dragTab != dragOverTab) {
		dragDropBefore = setDragIndicator(event, dragOverTab);
	}

	return false;
}

async function moveSelectionToIndex(selection, index, windowId) {
	selection.sort((a, b) => TABINTERFACE.get(a).index - TABINTERFACE.get(b).index);

	try {
		await browser.tabs.move(selection, {
			index,
			windowId
		});
	}
	catch (e) {
		var offset = 0;
		let n = selection.length;
		for (var i = 0; i < n; i++) {
			try {
				await browser.tabs.move(selection[i], {
					index: index + offset,
					windowId
				});
				offset++;
			}
			catch (e) {}
		}
	}
}

function moveTabsToGroup(groupId, index) {
	if (bgPage.getSelectionSourceWindow() == WINDOW_ID) {
		bgPage.enqueueTask(async function () {
			let selection = Selected.get();
			Selected.clear();
			await TABINTERFACE.setGroupId(selection, groupId, WINDOW_ID);
			await moveSelectionToIndex(selection, index, WINDOW_ID);
			reorderGroup(groupId);
		});
	} else {
		bgPage.enqueueTask(async function () {
			let selection = bgPage.getSelectionFromSourceWindow();
			await TABINTERFACE.setGroupId(selection, groupId, WINDOW_ID);
			await moveSelectionToIndex(selection, index, WINDOW_ID);
		}).then(function() {
			bgPage.enqueueTask(reorderGroup, groupId);
		});
	}
}

function tabDrop(e) {
	e.stopPropagation();

	if (dragTab == dragOverTab || dragOverTab.classList.contains('selection')) {
		return;
	}

	if (this.parentNode == pinned.content) {
		e.preventDefault();
		return;
	}

	let toTabId = Number(dragOverTab.getAttribute('tabId'));
	let toTab = TABINTERFACE.get(toTabId);
	let groupId = TABINTERFACE.getGroupId(toTabId);
	let toIndex = toTab.index;

	if (bgPage.getSelectionSourceWindow() == WINDOW_ID) {
		let tabId = Number(dragTab.getAttribute('tabId'));
		let tab = TABINTERFACE.get(tabId);

		if (tab.index < toIndex) {
			if (dragDropBefore) {
				toIndex--;
			}
		}
		else {
			if (!dragDropBefore) {
				toIndex++;
			}
		}
	} else {
		toIndex = !dragDropBefore ? toIndex++ : toIndex;
	}
	moveTabsToGroup(groupId, toIndex);
}

function groupDragOver(e) {
	e.preventDefault(); // Necessary. Allows us to drop.

	e.dataTransfer.dropEffect = 'move'; // See the section on the DataTransfer object.

	return false;
}

async function groupDrop(e) {
	e.stopPropagation();
	let groupId = Number(this.getAttribute('groupId'));
	moveTabsToGroup(groupId, -1);
	return false;
}

async function outsideDrop(e) {
	e.stopPropagation();
	let group = await GRPINTERFACE.new();
	await onGroupCreated(group.id);
	moveTabsToGroup(group.id, -1);

	return false;
}

function tabDragEnd(e) {
	dragCount = 0;
	this.classList.remove('drag');
	view.dragIndicator.classList.remove('show');
}