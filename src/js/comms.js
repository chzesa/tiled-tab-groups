async function commsUnloadGroup(id) {
	comms(MSG_UNLOAD_GROUP, id);
}

async function commsDeleteGroup(id) {
	comms(MSG_DELETE_GROUP, id);
}

async function commsReloadGroup(id) {
	comms(MSG_RELOAD_GROUP, id);
}

async function commsStashGroup(id, state) {
	comms(MSG_SET_STASHED, {
		id: id
		, state: state
	});
}

async function commsSetActive(id) {
	comms(MSG_SET_ACTIVE, id);
}

async function commsBeacon(id) {
	comms(MSG_BEACON, id);
}

async function commsRenameGroup(id, name) {
	comms(MSG_RENAME_GROUP, {
		name: name
		, id: id
	});
}

async function commsNewTab() {
	comms(MSG_NEWTAB);
}

async function commsNewGroup() {
	comms(MSG_NEW_GROUP);
}

async function commsSwitchToGroup(id) {
	comms(MSG_SWITCH_TO_GROUP, id);
}

async function commsOpenView() {
	comms(MSG_OPEN_VIEW);
}

async function commsReinit() {
	comms(MSG_REINIT);
}

async function commsUpdateCatchRules() {
	comms(MSG_UPDATE_CATCH_RULES);
}

async function comms(msg, options) {
	browser.runtime.sendMessage({
		message: msg
		, options: options
	});
}