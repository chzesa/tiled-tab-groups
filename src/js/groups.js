'use strict';

const groups = (function () {

	var windowId;
	var groups;

	var func = {
		newUid: async function () {
			var groupIndex = (await browser.sessions.getWindowValue(windowId, 'groupIndex'));

			var uid = groupIndex || 0;
			var newGroupIndex = uid + 1;

			await browser.sessions.setWindowValue(windowId, 'groupIndex', newGroupIndex);

			return uid;
		}
		, getIndex: function (id) {
			for (var i in groups) {
				if (groups[i].id == id) {
					return i;
				}
			}
			return -1;
		}
	};

	return {
		init: async function () {

			windowId = (await browser.windows.getCurrent()).id;
			groups = (await browser.sessions.getWindowValue(windowId, 'groups'));

			for (var i in groups) {
				groups[i].tabCount = 0;
				groups[i].windowId = windowId;
				if (groups[i].stash == undefined) {
					groups[i].stash = false;
				}
			}
		},

		save: async function () {
			await browser.sessions.setWindowValue(windowId, 'groups', groups);
		},

		create: async function () {
			const groupId = await func.newUid();

			const group = {
				id: groupId
				, name: `Group ${groupId}`
				, windowId: windowId
				, containerId: 'firefox-default'
				, rect: {
					x: 0
					, y: 0
					, w: 0.25
					, h: 0.5
				}
				, tabCount: 0
				, stash: false
			, };

			groups.push(group);

			await this.save();

			return group;
		},

		setStashed: async function (id, state) {
			groups[func.getIndex(id)].stash = state;
			await this.save();
		},

		remove: async function (id) {
			var index = func.getIndex(id);
			if (index == -1) {
				return;
			}
			groups.splice(index, 1);

			await this.save();
		},

		rename: async function (id, newName) {
			var index = func.getIndex(id);
			if (index == -1) {
				return;
			}
			groups[index].name = newName;

			await this.save();
		},

		getActive: async function () {
			return await browser.sessions.getWindowValue(windowId, 'activeGroup');
		},

		setActive: async function (id) {
			groups[func.getIndex(id)].stash = false;
			await this.save();

			await browser.sessions.setWindowValue(windowId, 'activeGroup', id);
			await tabs.toggleAll();
		},

		get: function (id) {
			var index = func.getIndex(id);
			if (index == -1) {
				return;
			}
			return groups[index];
		},

		getByIndex: function (pIndex) {
			return groups[pIndex];
		},

		getNext: function (id, dir) {
			var index = func.getIndex(id);
			if (index == -1) {
				return;
			}

			let next;

			if (dir) {
				next = Number(index) + 1;
			}
			else {
				next = Number(index) - 1;
				if (next < 0) {
					next = groups.length - 1;
				}
			}

			return groups[next % groups.length];
		},

		forEach: function (callback) {
			for (var i in groups) {
				callback(groups[i]);
			}
		}
	, };
})();