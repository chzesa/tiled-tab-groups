'use strict';

var dragTab = null;
var dragOverTab = null;
var dragCount = 0;
var dragDropBefore;

function tabDragStart(e) {
	if (e.ctrlKey) {
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

async function moveSelectionToIndex(selection, index) {
	try {
		await browser.tabs.move(selection, {
			index
		});
	}
	catch (e) {
		var offset = 0;
		let n = selection.length;
		for (var i = 0; i < n; i++) {
			try {

				await browser.tabs.move(selection[i], {
					index: index + offset
				});
				offset++;
			}
			catch (e) {}
		}
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

	var toTabId = Number(dragOverTab.getAttribute('tabId'));
	let groupId = TABINTERFACE.getGroupId(toTabId);

	var tabId = Number(dragTab.getAttribute('tabId'));
	let tab = TABINTERFACE.get(tabId);
	let toTab = TABINTERFACE.get(toTabId);

	var toIndex = toTab.index;

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

	let selection = Selected.get();
	Selected.clear();

	bgPage.enqueueTask(async function () {
		await TABINTERFACE.setGroupId(selection, groupId);
		await reorderGroup(groupId);
		await moveSelectionToIndex(selection, toIndex);
	});
}

function groupDragOver(e) {
	e.preventDefault(); // Necessary. Allows us to drop.

	e.dataTransfer.dropEffect = 'move'; // See the section on the DataTransfer object.

	return false;
}

function groupDrop(e) {
	e.stopPropagation();
	var groupId = Number(this.getAttribute('groupId'));

	bgPage.enqueueTask(async function () {
		let selection = Selected.get();
		Selected.clear();
		await TABINTERFACE.setGroupId(selection, groupId);
		await reorderGroup(groupId);
		await bgPage.tryBrowserArrayOperation(selection
			, browser.tabs.move, -1);
	});

	return false;
}

function outsideDrop(e) {
	e.stopPropagation();

	bgPage.enqueueTask(async function () {
		let selection = Selected.get();
		Selected.clear();
		let group = await GRPINTERFACE.new();
		await onGroupCreated(group.id);
		await TABINTERFACE.setGroupId(selection, group.id);
		await reorderGroup(group.id);
	});

	return false;
}

function tabDragEnd(e) {
	dragCount = 0;
	this.classList.remove('drag');
	view.dragIndicator.classList.remove('show');
}