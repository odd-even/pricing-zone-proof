#target "InDesign"

(function () {

    function ensureInDesignHost() {
        try {
            if (typeof app === "undefined" || !app.name || String(app.name).indexOf("InDesign") === -1) {
                alert("Apply Cell Style Pattern\n\nRun this from InDesign's Scripts panel:\nWindow > Utilities > Scripts\n\nInstall the .jsx (and Cell Style Presets.json) in that version's Scripts Panel folder.");
                return false;
            }
            return true;
        } catch (e) {
            alert("Apply Cell Style Pattern\n\nRun this from InDesign's Scripts panel (Window > Utilities > Scripts).");
            return false;
        }
    }

    // ---- Preset storage ----
    // Prefer presets beside the script when deployed in a Scripts folder; otherwise use Documents (shared across versions). (InDesign often leaves $.fileName empty or read-only when run from Scripts panel).
    function getPresetFile() {
        var scriptDir = null;
        try {
            var path = $.fileName;
            if (path && path.length > 0) {
                var f = new File(path);
                if (f.parent && f.parent.exists) scriptDir = f.parent;
            }
        } catch (e) {}

        var scriptPreset = scriptDir ? new File(scriptDir.fsName + "/Cell Style Presets.json") : null;
        var docsPreset = null;
        try {
            var folder = Folder.myDocuments;
            if (folder && folder.exists) docsPreset = new File(folder.fsName + "/Cell Style Presets.json");
        } catch (e2) {}

        if (scriptPreset && scriptPreset.exists) return scriptPreset;
        if (docsPreset && docsPreset.exists) return docsPreset;
        if (scriptPreset && /Scripts/i.test(scriptDir.fsName)) return scriptPreset;
        if (docsPreset) return docsPreset;
        return new File(Folder.userData.fsName + "/Cell Style Presets.json");
    }

    // ---- Pricing zone (pasteboard slug + optional header frame; not in table) ----
    var ZONE_SLUG_LABEL = "pricingZone";
    var ZONE_HEADER_LABEL = "pricingZoneHeader";
    var ZONE_VAR_NAME = "PricingZone";
    var PRICING_ZONE_OPTIONS = [
        { label: "(none)", region: null, id: null },
        { label: "USA — Zone 2", region: "USA", id: "2" },
        { label: "USA — Zone 3", region: "USA", id: "3" },
        { label: "USA — Zone 4", region: "USA", id: "4" },
        { label: "USA — Zone 5", region: "USA", id: "5" },
        { label: "USA — Zone 6", region: "USA", id: "6" },
        { label: "Canada — Zone A", region: "Canada", id: "A" },
        { label: "Canada — Zone B", region: "Canada", id: "B" },
        { label: "Canada — Zone C", region: "Canada", id: "C" },
        { label: "Canada — Zone D", region: "Canada", id: "D" },
        { label: "Canada — Zone E", region: "Canada", id: "E" }
    ];

    function zoneOptionLabels() {
        var labels = [];
        for (var i = 0; i < PRICING_ZONE_OPTIONS.length; i++) labels.push(PRICING_ZONE_OPTIONS[i].label);
        return labels;
    }

    function zoneOptionFromIndex(idx) {
        if (idx == null || idx < 1 || idx >= PRICING_ZONE_OPTIONS.length) return null;
        return PRICING_ZONE_OPTIONS[idx];
    }

    function zoneOptionIndexFromConfig(zc) {
        if (!zc || !zc.zoneId) return 0;
        for (var i = 1; i < PRICING_ZONE_OPTIONS.length; i++) {
            var z = PRICING_ZONE_OPTIONS[i];
            if (z.id === zc.zoneId && z.region === zc.region) return i;
        }
        return 0;
    }

    function formatZoneSlug(zone) {
        return zone.id;
    }

    function formatZoneHeader(zone) {
        return zone.id;
    }

    function getPageForTable(tbl) {
        try {
            var story = tbl.parent;
            if (!story || !story.isValid) return null;
            var tf = story.parent;
            if (!tf || !tf.isValid) return null;
            if (tf.parentPage && tf.parentPage.isValid) return tf.parentPage;
        } catch (e) {}
        return null;
    }

    function getSpreadForTable(tbl) {
        try {
            var pg = getPageForTable(tbl);
            if (pg && pg.parent && pg.parent.isValid) return pg.parent;
            var story = tbl.parent;
            if (!story || !story.isValid) return null;
            var tf = story.parent;
            if (tf && tf.isValid && tf.parent && tf.parent.isValid) return tf.parent;
        } catch (e) {}
        return null;
    }

    function getAppliedMasterForTable(tbl) {
        try {
            var pg = getPageForTable(tbl);
            if (pg && pg.appliedMaster && pg.appliedMaster.isValid) return pg.appliedMaster;
        } catch (e) {}
        return null;
    }

    function pushUniqueFrame(list, frame) {
        if (!frame) return;
        for (var i = 0; i < list.length; i++) {
            if (list[i] === frame) return;
        }
        list.push(frame);
    }

    function labelMatches(item, label) {
        if (!item || !label) return false;
        try {
            var l = String(item.label || "");
            if (l === label) return true;
            if (l.replace(/^\s+|\s+$/g, "").toLowerCase() === label.toLowerCase()) return true;
        } catch (e) {}
        return false;
    }

    function findTextFramesByLabel(doc, label) {
        var found = [];
        if (!label) return found;
        function addMatches(frames) {
            for (var i = 0; i < frames.length; i++) {
                try {
                    if (labelMatches(frames[i], label) && frames[i].isValid) pushUniqueFrame(found, frames[i]);
                } catch (e) {}
            }
        }
        try {
            addMatches(doc.textFrames.everyItem().getElements());
        } catch (e2) {}
        try {
            var pages = doc.pages.everyItem().getElements();
            for (var p = 0; p < pages.length; p++) {
                try {
                    addMatches(pages[p].textFrames.everyItem().getElements());
                } catch (ePage) {}
            }
        } catch (ePages) {}
        try {
            var masters = doc.masterSpreads.everyItem().getElements();
            for (var m = 0; m < masters.length; m++) {
                try {
                    addMatches(masters[m].textFrames.everyItem().getElements());
                } catch (e3) {}
            }
        } catch (e4) {}
        return found;
    }

    function framePageName(fr) {
        try {
            if (fr.parentPage && fr.parentPage.isValid) return fr.parentPage.name;
            if (fr.parent && fr.parent.isValid && fr.parent.name) return fr.parent.name;
        } catch (e) {}
        return "?";
    }

    function frameOnSpread(fr, spread) {
        if (!fr || !spread) return false;
        try {
            if (fr.parent === spread) return true;
            if (fr.parent && fr.parent.parent === spread) return true;
            if (fr.parentPage && fr.parentPage.isValid && fr.parentPage.parent === spread) return true;
        } catch (e) {}
        return false;
    }

    function frameOnPage(fr, page) {
        if (!fr || !page) return false;
        try {
            if (fr.parentPage === page) return true;
            if (fr.parent === page) return true;
        } catch (e) {}
        return false;
    }

    function pickSlugFrame(frames, spread, page) {
        if (!frames || frames.length === 0) return null;
        if (page) {
            for (var pi = 0; pi < frames.length; pi++) {
                if (frameOnPage(frames[pi], page)) return frames[pi];
            }
        }
        if (spread) {
            for (var i = 0; i < frames.length; i++) {
                if (frameOnSpread(frames[i], spread)) return frames[i];
            }
        }
        if (frames.length === 1) return frames[0];
        return frames[0];
    }

    function pickHeaderFrame(frames, masterSpread, spread, page) {
        if (!frames || frames.length === 0) return null;
        if (page) {
            for (var pj = 0; pj < frames.length; pj++) {
                if (frameOnPage(frames[pj], page)) return frames[pj];
            }
        }
        if (spread) {
            for (var sj = 0; sj < frames.length; sj++) {
                if (frameOnSpread(frames[sj], spread)) return frames[sj];
            }
        }
        if (masterSpread) {
            for (var i = 0; i < frames.length; i++) {
                if (frameOnSpread(frames[i], masterSpread)) return frames[i];
            }
        }
        if (frames.length === 1) return frames[0];
        return frames[0];
    }

    function setTextFrameContents(tf, text) {
        if (!tf || !tf.isValid) return false;
        try {
            if (tf.locked) tf.locked = false;
        } catch (e0) {}
        try {
            tf.contents = text;
            return true;
        } catch (e) {}
        try {
            if (tf.parentStory && tf.parentStory.isValid) {
                tf.parentStory.contents = text;
                return true;
            }
        } catch (e2) {}
        try {
            if (tf.texts && tf.texts.length > 0) {
                tf.texts[0].contents = text;
                return true;
            }
        } catch (e3) {}
        return false;
    }

    function trySetTextVariable(doc, name, value) {
        try {
            var v = doc.textVariables.itemByName(name);
            if (v && v.isValid) {
                v.variableOptions.contents = value;
                return true;
            }
        } catch (e) {}
        return false;
    }

    function applyPricingZone(doc, table, zone) {
        if (!zone || !zone.id) return { ok: false, message: "No zone selected in the dropdown (choose USA or Canada zone, not “(none)”)." };
        var slugText = formatZoneSlug(zone);
        var headerText = formatZoneHeader(zone);
        var page = getPageForTable(table);
        var spread = getSpreadForTable(table);
        var masterSpread = getAppliedMasterForTable(table);
        var slugFrames = findTextFramesByLabel(doc, ZONE_SLUG_LABEL);
        var headerFrames = findTextFramesByLabel(doc, ZONE_HEADER_LABEL);
        var slugTf = pickSlugFrame(slugFrames, spread, page);
        var headerTf = pickHeaderFrame(headerFrames, masterSpread, spread, page);
        var updated = [];
        var missing = [];

        if (slugTf && setTextFrameContents(slugTf, slugText)) {
            updated.push("slug (“" + ZONE_SLUG_LABEL + "” on page " + framePageName(slugTf) + " → " + slugText + ")");
        } else if (slugFrames.length > 0) {
            missing.push("slug frame found (" + slugFrames.length + ") but could not write — unlock the frame/layer");
        } else {
            missing.push("slug frame with Script Label “" + ZONE_SLUG_LABEL + "” (Object → Script Label, not layer name)");
        }

        if (headerTf && setTextFrameContents(headerTf, headerText)) {
            var headerWhere = "page " + framePageName(headerTf);
            if (masterSpread && frameOnSpread(headerTf, masterSpread)) headerWhere = "master";
            updated.push("header “" + ZONE_HEADER_LABEL + "” on " + headerWhere + " → " + headerText);
        } else if (headerFrames.length > 0) {
            missing.push("header frame found (" + headerFrames.length + ") but could not write");
        }

        if (trySetTextVariable(doc, ZONE_VAR_NAME, headerText)) {
            updated.push("text variable (“" + ZONE_VAR_NAME + "” → " + headerText + ")");
        }

        if (updated.length === 0) {
            var pageHint = page && page.name ? (" Table is on page " + page.name + ".") : "";
            return {
                ok: false,
                message: "Could not update any zone targets." + pageHint + "\n\n"
                    + "1. Select a zone in the dropdown (not “(none)”).\n"
                    + "2. Select the text frame → Object → Script Label…\n"
                    + "   • Hidden slug: “" + ZONE_SLUG_LABEL + "”\n"
                    + "   • Visible header: “" + ZONE_HEADER_LABEL + "”\n"
                    + "3. Frame can be on the page or pasteboard near the table.\n"
                    + "Found: " + slugFrames.length + " slug, " + headerFrames.length + " header frame(s)."
            };
        }
        var msg = "Zone " + zone.id + " (" + zone.region + "): updated " + updated.join(", ") + ".";
        if (missing.length > 0) msg += "\n\nNot updated: " + missing.join("; ") + ".";
        return { ok: true, message: msg };
    }

    function loadPresets() {
        var file = getPresetFile();
        if (!file.exists) return [];
        try {
            file.open("r");
            file.encoding = "UTF-8";
            var s = file.read();
            file.close();
            if (typeof JSON !== "undefined" && JSON.parse) {
                var data = JSON.parse(s);
                return (data && data.presets) ? data.presets : [];
            }
            return parsePresetsFallback(s);
        } catch (e) {
            return [];
        }
    }

    function parsePresetsFallback(s) {
        try {
            var presets = [];
            var m = s.match(/\{[\s\S]*\}/);
            if (m) {
                var obj = eval("(" + m[0] + ")");
                if (obj.presets && obj.presets.length) return obj.presets;
            }
        } catch (e) {}
        return [];
    }

    function savePresets(presets) {
        var file = getPresetFile();
        try {
            if (file.parent && !file.parent.exists) file.parent.create();
            var s = "{\"presets\":" + (typeof JSON !== "undefined" && JSON.stringify ? JSON.stringify(presets) : serializePresets(presets)) + "}";
            file.encoding = "UTF-8";
            file.open("w");
            file.write(s);
            file.close();
            return { ok: true };
        } catch (e) {
            return { ok: false, err: e.toString() };
        }
    }

    function serializePresets(presets) {
        var parts = [];
        for (var i = 0; i < presets.length; i++) {
            parts.push(serializePreset(presets[i]));
        }
        return "[" + parts.join(",") + "]";
    }

    function serializePreset(p) {
        var a = p.assignments;
        var keys = [];
        for (var k in a) if (a.hasOwnProperty(k)) keys.push(parseInt(k, 10));
        keys.sort(function (x, y) { return x - y; });
        var assignParts = [];
        for (var i = 0; i < keys.length; i++) {
            var ass = a[keys[i]];
            var part = "\"" + keys[i] + "\":{" + "\"type\":\"" + ass.type + "\"";
            if (ass.type === "single") {
                part += ",\"styleName\":\"" + (ass.styleName || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\",\"skip\":" + (ass.skip || 0);
                if (ass.paragraphStyleName) part += ",\"paragraphStyleName\":\"" + (ass.paragraphStyleName || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"";
                if (ass.columnWidth) part += ",\"columnWidth\":" + ass.columnWidth;
                if (ass.rowHeight) part += ",\"rowHeight\":" + ass.rowHeight;
            } else {
                part += ",\"cycle\":" + ass.cycle + ",\"skip\":" + (ass.skip || 0) + ",\"positions\":{";
                var posParts = [];
                for (var pk in ass.positions) if (ass.positions.hasOwnProperty(pk)) {
                    var pv = ass.positions[pk];
                    if (typeof pv === "object" && pv !== null) {
                        var pp = "\"" + pk + "\":{\"styleName\":\"" + (pv.styleName || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"";
                        if (pv.paragraphStyleName) pp += ",\"paragraphStyleName\":\"" + (pv.paragraphStyleName || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"";
                        if (pv.rowHeight) pp += ",\"rowHeight\":" + pv.rowHeight;
                        pp += "}";
                        posParts.push(pp);
                    } else {
                        posParts.push("\"" + pk + "\":\"" + (pv || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"");
                    }
                }
                part += posParts.join(",") + "}";
                if (ass.columnWidth) part += ",\"columnWidth\":" + ass.columnWidth;
            }
            part += "}";
            assignParts.push(part);
        }
        var mc = p.mergedConfig;
        var mcPart = "";
        if (mc && (mc.styleName || mc.paragraphStyleName || (mc.rowHeight != null && mc.rowHeight > 0))) {
            var rh = (mc.rowHeight != null && mc.rowHeight > 0) ? mc.rowHeight : "null";
            mcPart = ",\"mergedConfig\":{\"styleName\":\"" + (mc.styleName || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\",\"paragraphStyleName\":\"" + (mc.paragraphStyleName || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\",\"rowHeight\":" + rh + "}";
        }
        var zcPart = "";
        var zc = p.zoneConfig;
        if (zc && zc.zoneId && zc.region) {
            zcPart = ",\"zoneConfig\":{\"region\":\"" + zc.region.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\",\"zoneId\":\"" + zc.zoneId.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"}";
        }
        return "{\"name\":\"" + (p.name || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\",\"assignments\":{" + assignParts.join(",") + "}" + mcPart + zcPart + "}";
    }

    // ---- Main ----
    function main() {
        if (app.documents.length === 0) { alert("Open a document first."); return; }
        if (app.selection.length === 0) { alert("Click in a table cell first.\n(Click inside a table cell, then run the script.)"); return; }

        var doc = app.activeDocument;
        var sel = app.selection[0];
        var table = null;

        // Resolve table from selection
        try {
            if (sel.rows !== undefined && sel.columns !== undefined) table = sel; // Table object
            else if (sel instanceof Cell) table = sel.parent.parent; // Cell->Row->Table
            else if (sel.hasOwnProperty("parent") && sel.parent instanceof Cell) table = sel.parent.parent.parent;
            else if (sel.hasOwnProperty("tables") && sel.tables.length) table = sel.tables[0];
            else if (sel.hasOwnProperty("insertionPoints") && sel.insertionPoints.length &&
                sel.insertionPoints[0].tables.length) table = sel.insertionPoints[0].tables[0];
        } catch (e) {}

        if (!table) {
            alert("Could not find a table.\nPut the text cursor inside a table cell and try again.");
            return;
        }

        var colCount = table.columns.length;
        var rowCount = table.rows.length;

        // Collect cell styles (wrap in try/catch in case document is slow or problematic)
        var styleNames = [];
        try {
            var styles = doc.cellStyles.everyItem().getElements();
            for (var i = 0; i < styles.length; i++) styleNames.push(styles[i].name);
        } catch (e) {
            alert("Could not read cell styles: " + e);
            return;
        }
        if (styleNames.length === 0) styleNames.push("[None]");

        var paraStyleNames = ["(none)"];
        try {
            var paraStyles = doc.paragraphStyles.everyItem().getElements();
            for (var pi = 0; pi < paraStyles.length; pi++) paraStyleNames.push(paraStyles[pi].name);
        } catch (e) {}

        // ---------- UI ----------
        var w;
        try {
        w = new Window("dialog", "Apply Cell Styles by Column");
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.spacing = 14;
        w.margins = 16;
        w.preferredSize = [800, 540];

        var scrollRow = w.add("group");
        scrollRow.orientation = "row";
        scrollRow.alignChildren = ["fill", "top"];
        scrollRow.preferredSize = [768, 400];

        var contentHolder = scrollRow.add("group");
        contentHolder.preferredSize = [750, 400];
        contentHolder.alignChildren = ["fill", "top"];

        var contentPanel = contentHolder.add("panel", undefined, undefined, { borderStyle: "black" });
        contentPanel.orientation = "column";
        contentPanel.alignChildren = ["fill", "top"];
        contentPanel.spacing = 14;
        contentPanel.margins = 12;

        // Per-column assignments: colAssignments[colIndex] = { type:"single"|"pattern", ... }
        var colAssignments = {};
        var maxCycle = 6;

        // Intro
        var stIntro = contentPanel.add("statictext", undefined, "Assign cell styles per column: one style for the whole column, or alternating row patterns.", { multiline: true });
        stIntro.preferredSize = [-1, 24];

        // ---- Row 1: Presets | Step 1 Columns (side by side) ----
        var row1 = contentPanel.add("group");
        row1.orientation = "row";
        row1.alignChildren = ["fill", "top"];
        row1.spacing = 16;

        // ---- Presets ----
        var presets = [];
        var pPresets = row1.add("panel", undefined, "Presets");
        pPresets.preferredSize = [200, -1];
        pPresets.orientation = "column";
        pPresets.alignChildren = ["fill", "top"];
        pPresets.spacing = 8;
        pPresets.margins = 12;

        var pPresetLabel = pPresets.add("group");
        pPresetLabel.add("statictext", undefined, "Saved configurations:");
        var ddPresets = pPresets.add("dropdownlist", undefined, ["(click Refresh to load presets)"]);
        ddPresets.preferredSize = [-1, 22];
        ddPresets.selection = 0;

        var gPresetBtns = pPresets.add("group");
        gPresetBtns.alignChildren = ["fill", "center"];
        gPresetBtns.spacing = 6;
        var bRefresh = gPresetBtns.add("button", undefined, "Refresh");
        var bLoad = gPresetBtns.add("button", undefined, "Load");
        var bSave = gPresetBtns.add("button", undefined, "Save");
        var bDelete = gPresetBtns.add("button", undefined, "Delete");

        pPresets.add("statictext", undefined, "Pricing zone:");
        var ddZone = pPresets.add("dropdownlist", undefined, zoneOptionLabels());
        ddZone.preferredSize = [-1, 22];
        ddZone.selection = 0;
        ddZone.helpTip = "Choose a zone (not “none”). Writes to frames labeled " + ZONE_SLUG_LABEL + " or " + ZONE_HEADER_LABEL;
        var stZoneHelp = pPresets.add("statictext", undefined, "Script Label on text frame (Object → Script Label). Page or pasteboard OK.", { multiline: true });
        stZoneHelp.preferredSize = [-1, 28];

        function getZoneConfigFromUI() {
            var zi = ddZone.selection ? ddZone.selection.index : 0;
            var opt = zoneOptionFromIndex(zi);
            if (!opt) return null;
            return { region: opt.region, zoneId: opt.id };
        }

        function setZoneUIFromConfig(zc) {
            ddZone.selection = zoneOptionIndexFromConfig(zc);
        }

        function loadPresetIntoState(p) {
            colAssignments = {};
            var a = p.assignments;
            for (var k in a) if (a.hasOwnProperty(k)) {
                var key = parseInt(k, 10);
                if (!isNaN(key)) colAssignments[key] = a[k];
            }
            var mc = p.mergedConfig;
            if (mc) {
                if (mc.styleName) {
                    var msItem = ddMerged.find(mc.styleName);
                    ddMerged.selection = msItem ? msItem : ddMerged.items[0];
                } else {
                    ddMerged.selection = ddMerged.items[0];
                }
                if (mc.paragraphStyleName) {
                    var mpItem = ddMergedPara.find(mc.paragraphStyleName);
                    ddMergedPara.selection = mpItem ? mpItem : ddMergedPara.items[0];
                } else {
                    ddMergedPara.selection = ddMergedPara.items[0];
                }
                if (mc.rowHeight) etMergedHeight.text = String(Math.round(mc.rowHeight / 72 * 10000) / 10000);
                else etMergedHeight.text = "";
            } else {
                ddMerged.selection = ddMerged.items[0];
                ddMergedPara.selection = ddMergedPara.items[0];
                etMergedHeight.text = "";
            }
            setZoneUIFromConfig(p.zoneConfig);
            updateSummary();
        }

        function refreshPresets() {
            presets = loadPresets();
            ddPresets.removeAll();
            if (presets.length === 0) ddPresets.add("item", "(no saved presets)");
            else for (var pi = 0; pi < presets.length; pi++) ddPresets.add("item", presets[pi].name);
            ddPresets.selection = 0;
        }
        bRefresh.onClick = refreshPresets;

        bLoad.onClick = function () {
            if (presets.length === 0) { alert("No presets saved yet."); return; }
            var idx = ddPresets.selection ? ddPresets.selection.index : 0;
            if (idx < 0 || idx >= presets.length) return;
            loadPresetIntoState(presets[idx]);
        };

        bSave.onClick = function () {
            var keys = [];
            for (var k in colAssignments) if (colAssignments.hasOwnProperty(k)) keys.push(parseInt(k, 10));
            var mergedStyleIdx = ddMerged.selection ? ddMerged.selection.index : 0;
            var mergedStyleName = (mergedStyleIdx > 0 && ddMerged.selection) ? ddMerged.selection.text : null;
            var mergedParaIdx = ddMergedPara.selection ? ddMergedPara.selection.index : 0;
            var mergedParaName = (mergedParaIdx > 0 && ddMergedPara.selection) ? ddMergedPara.selection.text : null;
            var mergedH = parseFloat(etMergedHeight.text, 10);
            var mergedRowHeight = (isNaN(mergedH) || mergedH <= 0) ? null : mergedH * 72;
            var mergedConfig = (mergedStyleName || mergedRowHeight) ? { styleName: mergedStyleName || null, paragraphStyleName: mergedParaName || null, rowHeight: mergedRowHeight } : null;

            if (keys.length === 0 && !mergedConfig) {
                alert("Nothing to save. Configure column assignments and/or full-width merged cell styling first.");
                return;
            }
            var dlgSave = new Window("dialog", "Save preset");
            dlgSave.add("statictext", undefined, "Preset name:");
            var etName = dlgSave.add("edittext", undefined, "My preset");
            etName.characters = 25;
            var gSaveBtns = dlgSave.add("group");
            gSaveBtns.alignment = "right";
            gSaveBtns.add("button", undefined, "Cancel", { name: "cancel" });
            gSaveBtns.add("button", undefined, "Save", { name: "ok" });
            if (dlgSave.show() !== 1) return;
            var name = etName.text;
            name = name.replace(/^\s+|\s+$/g, "");
            if (name.length === 0) return;
            var idx = -1;
            for (var i = 0; i < presets.length; i++) if (presets[i].name === name) { idx = i; break; }
            var copy = {};
            for (var k in colAssignments) if (colAssignments.hasOwnProperty(k)) copy[k] = colAssignments[k];
            var zoneConfig = getZoneConfigFromUI();
            var preset = { name: name, assignments: copy, mergedConfig: mergedConfig, zoneConfig: zoneConfig };
            if (idx >= 0) presets[idx] = preset; else presets.push(preset);
            var result = savePresets(presets);
            if (result.ok) {
                ddPresets.removeAll();
                for (var i = 0; i < presets.length; i++) ddPresets.add("item", presets[i].name);
                ddPresets.selection = idx >= 0 ? idx : presets.length - 1;
                alert("Preset saved.");
            } else {
                alert("Could not save preset. " + (result.err || "Check file permissions."));
            }
        };

        bDelete.onClick = function () {
            if (presets.length === 0) return;
            var idx = ddPresets.selection ? ddPresets.selection.index : 0;
            if (idx < 0 || idx >= presets.length) return;
            var dlgDel = new Window("dialog", "Delete preset");
            dlgDel.add("statictext", undefined, "Delete preset \"" + presets[idx].name + "\"?");
            var gDelBtns = dlgDel.add("group");
            gDelBtns.alignment = "right";
            gDelBtns.add("button", undefined, "Cancel", { name: "cancel" });
            gDelBtns.add("button", undefined, "Delete", { name: "ok" });
            if (dlgDel.show() !== 1) return;
            presets.splice(idx, 1);
            var result = savePresets(presets);
            if (result.ok) {
                ddPresets.removeAll();
                for (var i = 0; i < presets.length; i++) ddPresets.add("item", presets[i].name);
                if (presets.length === 0) ddPresets.add("item", "(no saved presets)");
                ddPresets.selection = 0;
            } else {
                alert("Could not save after delete. " + (result.err || ""));
            }
        };

        // ---- Step 1: Select columns ----
        var pCols = row1.add("panel", undefined, "Step 1 - Select columns");
        pCols.orientation = "column";
        pCols.alignChildren = ["fill", "top"];
        pCols.spacing = 8;
        pCols.margins = 12;
        pCols.preferredSize = [340, -1];

        var stColInfo = pCols.add("statictext", undefined, "Table: " + colCount + " columns, " + rowCount + " rows");

        var gColList = pCols.add("group");
        gColList.orientation = "row";
        gColList.alignChildren = ["fill", "top"];
        gColList.spacing = 8;
        var lb = gColList.add("listbox", undefined, [], { multiselect: true });
        lb.preferredSize = [-1, 200];
        for (var c = 1; c <= colCount; c++) {
            lb.add("item", "Column " + c);
        }

        var gColBtns = gColList.add("group");
        gColBtns.orientation = "column";
        gColBtns.alignChildren = "fill";
        gColBtns.spacing = 4;
        gColBtns.add("button", undefined, "All", function () {
            for (var i = 0; i < lb.items.length; i++) lb.items[i].selected = true;
        });
        gColBtns.add("button", undefined, "None", function () {
            for (var i = 0; i < lb.items.length; i++) lb.items[i].selected = false;
        });

        // ---- Step 2: Configure and assign ----
        var pConfig = contentPanel.add("panel", undefined, "Step 2 - Configure and assign");
        pConfig.orientation = "column";
        pConfig.alignChildren = ["fill", "top"];
        pConfig.spacing = 2;
        pConfig.margins = 6;

        var rbSingle = pConfig.add("radiobutton", undefined, "One style - same cell style for all rows in column");
        rbSingle.value = true;
        var rbPattern = pConfig.add("radiobutton", undefined, "Row pattern - alternating styles");

        var gSingle = pConfig.add("group");
        gSingle.orientation = "row";
        gSingle.alignChildren = ["left", "center"];
        gSingle.spacing = 6;
        gSingle.add("statictext", undefined, "Cell:");
        var ddSingle = gSingle.add("dropdownlist", undefined, styleNames);
        ddSingle.preferredSize = [140, 20];
        ddSingle.selection = 0;
        gSingle.add("statictext", undefined, "Skip:");
        var etSkipSingle = gSingle.add("edittext", undefined, "0");
        etSkipSingle.characters = 2;
        gSingle.add("statictext", undefined, "Para:");
        var ddParaSingle = gSingle.add("dropdownlist", undefined, paraStyleNames);
        ddParaSingle.preferredSize = [100, 20];
        ddParaSingle.selection = 0;
        gSingle.add("statictext", undefined, "W:");
        var etWidthSingle = gSingle.add("edittext", undefined, "");
        etWidthSingle.characters = 4;
        gSingle.add("statictext", undefined, "H:");
        var etHeightSingle = gSingle.add("edittext", undefined, "");
        etHeightSingle.characters = 4;

        var gPattern = pConfig.add("group");
        gPattern.orientation = "column";
        gPattern.spacing = 2;
        gPattern.visible = false;
        var gPatternRow1 = gPattern.add("group");
        gPatternRow1.alignChildren = ["left", "center"];
        gPatternRow1.spacing = 6;
        gPatternRow1.add("statictext", undefined, "Cycle:");
        var etCycle = gPatternRow1.add("edittext", undefined, "2");
        etCycle.characters = 2;
        gPatternRow1.add("statictext", undefined, "Skip:");
        var etSkipPattern = gPatternRow1.add("edittext", undefined, "0");
        etSkipPattern.characters = 2;
        gPatternRow1.add("statictext", undefined, "W:");
        var etWidthPattern = gPatternRow1.add("edittext", undefined, "");
        etWidthPattern.characters = 4;
        var stPosLabel = gPattern.add("statictext", undefined, "R1/R2/... cell, para, ht:");
        var posDds = [];
        var posParaDds = [];
        var posHeightEt = [];
        var posRows = [];
        for (var i = 0; i < maxCycle; i++) {
            var pr = gPattern.add("group");
            pr.alignChildren = ["left", "center"];
            pr.spacing = 6;
            pr.add("statictext", undefined, "R" + (i + 1) + ":");
            var d = pr.add("dropdownlist", undefined, styleNames);
            d.preferredSize = [180, 20];
            d.selection = 0;
            pr.add("statictext", undefined, "para:");
            var pd = pr.add("dropdownlist", undefined, paraStyleNames);
            pd.preferredSize = [120, 20];
            pd.selection = 0;
            pr.add("statictext", undefined, "ht:");
            var he = pr.add("edittext", undefined, "");
            he.characters = 4;
            posDds.push(d);
            posParaDds.push(pd);
            posHeightEt.push(he);
            posRows.push(pr);
            pr.visible = (i < 2);
        }

        function setModeUI() {
            var isSingle = rbSingle.value;
            gSingle.visible = isSingle;
            gPattern.visible = !isSingle;
            updatePreview();
        }
        rbSingle.onClick = setModeUI;
        rbPattern.onClick = setModeUI;

        function updatePosVisibility() {
            var cy = parseInt(etCycle.text, 10);
            if (isNaN(cy) || cy < 1) cy = 1;
            if (cy > maxCycle) cy = maxCycle;
            for (var i = 0; i < maxCycle; i++) {
                posRows[i].visible = (i < cy);
            }
        }
        etCycle.onChange = function () { updatePosVisibility(); updatePreview(); };

        // Preview: first 4 rows x assigned columns (listbox - reliable in ScriptUI)
        var pPreview = pConfig.add("panel", undefined, "Preview (first 4 rows)");
        pPreview.alignChildren = ["fill", "top"];
        pPreview.spacing = 2;
        pPreview.margins = 6;
        pPreview.preferredSize = [-1, 115];
        var previewList = pPreview.add("listbox", undefined, [], { multiselect: false });
        previewList.preferredSize = [-1, 95];

        function getStyleNameForRow(ass, rowIndex) {
            if (!ass) return "-";
            var skip = ass.skip || 0;
            if (rowIndex < skip) return "(skip)";
            if (ass.type === "single") return ass.styleName || "-";
            var pos = ((rowIndex - skip) % ass.cycle) + 1;
            var pv = ass.positions[pos];
            if (!pv) return "-";
            return (typeof pv === "string" ? pv : (pv.styleName || "-"));
        }

        function padRight(str, n) {
            str = String(str);
            if (str.length >= n) return str.substring(0, n);
            return str + Array(n - str.length + 1).join(" ");
        }

        function updatePreview() {
            var lines = [];
            var assignedCols = [];
            for (var k in colAssignments) if (colAssignments.hasOwnProperty(k)) assignedCols.push(parseInt(k, 10));
            assignedCols.sort(function (a, b) { return a - b; });

            if (assignedCols.length === 0) {
                lines.push("Select columns and assign to see preview.");
                lines.push("(Pick columns in Step 1, set style above, click Assign)");
            } else {
                var w = 10;
                var header = "Row  |";
                for (var c = 0; c < assignedCols.length; c++) header += padRight(" Col" + (assignedCols[c] + 1), w) + "|";
                lines.push(header);
                for (var r = 0; r < 4; r++) {
                    var rowStr = padRight((r + 1) + ": ", 5) + "|";
                    for (var c = 0; c < assignedCols.length; c++) {
                        var ass = colAssignments[assignedCols[c]];
                        var name = getStyleNameForRow(ass, r);
                        if (name.length > w - 2) name = name.substring(0, w - 3) + ".";
                        rowStr += padRight(" " + name, w) + "|";
                    }
                    lines.push(rowStr);
                }
            }
            if (previewList.removeAll) previewList.removeAll(); else while (previewList.items.length > 0) previewList.remove(0);
            for (var i = 0; i < lines.length; i++) previewList.add("item", lines[i]);
        }

        ddSingle.onChange = updatePreview;
        etSkipSingle.onChange = updatePreview;
        etSkipPattern.onChange = updatePreview;
        for (var di = 0; di < posDds.length; di++) posDds[di].onChange = updatePreview;
        setModeUI();
        updatePreview();

        var bAssign = pConfig.add("button", undefined, "Assign to selected columns");
        bAssign.preferredSize = [-1, 22];
        bAssign.margins = [0, 2, 0, 0];

        bAssign.onClick = function () {
            var selCols = [];
            for (var i = 0; i < lb.items.length; i++) {
                if (lb.items[i].selected) selCols.push(i);
            }
            if (selCols.length === 0) {
                alert("Select at least one column first.");
                return;
            }

            if (rbSingle.value) {
                var styleName = ddSingle.selection ? ddSingle.selection.text : null;
                if (!styleName) { alert("Pick a cell style."); return; }
                var skip = parseInt(etSkipSingle.text, 10);
                if (isNaN(skip) || skip < 0) skip = 0;
                var paraIdx = ddParaSingle.selection ? ddParaSingle.selection.index : 0;
                var paraName = (paraIdx > 0 && ddParaSingle.selection) ? ddParaSingle.selection.text : null;
                var w = parseFloat(etWidthSingle.text, 10);
                var h = parseFloat(etHeightSingle.text, 10);
                for (var j = 0; j < selCols.length; j++) {
                    colAssignments[selCols[j]] = { type: "single", styleName: styleName, skip: skip, paragraphStyleName: paraName, columnWidth: isNaN(w) || w <= 0 ? null : w * 72, rowHeight: isNaN(h) || h <= 0 ? null : h * 72 };
                }
            } else {
                var cycle = parseInt(etCycle.text, 10);
                if (isNaN(cycle) || cycle < 1 || cycle > maxCycle) {
                    alert("Cycle length must be 1.." + maxCycle + ".");
                    return;
                }
                var skip = parseInt(etSkipPattern.text, 10);
                if (isNaN(skip) || skip < 0) skip = 0;
                var colW = parseFloat(etWidthPattern.text, 10);
                var positions = {};
                for (var p = 0; p < cycle; p++) {
                    var sn = posDds[p].selection ? posDds[p].selection.text : null;
                    if (!sn) { alert("Pick a style for position " + (p + 1) + "."); return; }
                    var pParaIdx = posParaDds[p].selection ? posParaDds[p].selection.index : 0;
                    var pParaName = (pParaIdx > 0 && posParaDds[p].selection) ? posParaDds[p].selection.text : null;
                    var pH = parseFloat(posHeightEt[p].text, 10);
                    positions[p + 1] = { styleName: sn, paragraphStyleName: pParaName, rowHeight: isNaN(pH) || pH <= 0 ? null : pH * 72 };
                }
                for (var j = 0; j < selCols.length; j++) {
                    colAssignments[selCols[j]] = { type: "pattern", cycle: cycle, skip: skip, positions: positions, columnWidth: isNaN(colW) || colW <= 0 ? null : colW * 72 };
                }
            }

            updateSummary();
        };

        // ---- Row 2: Full-width merged | Current assignments ----
        var row2 = contentPanel.add("group");
        row2.orientation = "row";
        row2.alignChildren = ["fill", "top"];
        row2.spacing = 16;

        // ---- Full-width merged cells ----
        var pMerged = row2.add("panel", undefined, "Full-width merged cells");
        pMerged.alignChildren = ["fill", "top"];
        pMerged.spacing = 8;
        pMerged.margins = 12;
        pMerged.preferredSize = [240, -1];

        var stMergedHelp = pMerged.add("statictext", undefined, "Rows that span all columns (e.g. header rows):", { multiline: true });
        stMergedHelp.preferredSize = [-1, 20];
        var gMerged = pMerged.add("group");
        gMerged.orientation = "column";
        gMerged.spacing = 6;
        gMerged.add("statictext", undefined, "Cell style:");
        var ddMerged = gMerged.add("dropdownlist", undefined, ["(none)"].concat(styleNames));
        ddMerged.preferredSize = [-1, 22];
        ddMerged.selection = 0;
        gMerged.add("statictext", undefined, "Paragraph style (optional):");
        var ddMergedPara = gMerged.add("dropdownlist", undefined, paraStyleNames);
        ddMergedPara.preferredSize = [-1, 22];
        ddMergedPara.selection = 0;
        gMerged.add("statictext", undefined, "Row height (in, blank = no change):");
        var etMergedHeight = gMerged.add("edittext", undefined, "");
        etMergedHeight.characters = 8;
        ddMerged.onChange = updateSummary;
        ddMergedPara.onChange = updateSummary;
        etMergedHeight.onChange = updateSummary;

        // ---- Current assignments ----
        var pSummary = row2.add("panel", undefined, "Current assignments");
        pSummary.orientation = "column";
        pSummary.alignChildren = ["fill", "top"];
        pSummary.spacing = 8;
        pSummary.margins = 12;
        pSummary.preferredSize = [420, -1];

        var summaryList = pSummary.add("listbox", undefined, [], { multiselect: false });
        summaryList.preferredSize = [-1, 130];

        var gClear = pSummary.add("group");
        gClear.alignment = "right";
        gClear.add("button", undefined, "Clear all", function () {
            colAssignments = {};
            updateSummary();
        });

        var scrollbar = scrollRow.add("scrollbar", undefined, 0, 100, 0, false);
        scrollbar.preferredSize = [18, 400];
        scrollbar.minvalue = 0;
        scrollbar.onChanging = function () {
            contentPanel.location = [0, -scrollbar.value];
        };
        var visibleH = 400;
        w.onShow = function () {
            var ch = contentPanel.size[1];
            if (ch > visibleH) {
                scrollbar.maxvalue = ch - visibleH;
            } else {
                scrollbar.maxvalue = 0;
            }
        };

        function updateSummary() {
            var lines = [];
            for (var k = 0; k < colCount; k++) {
                var a = colAssignments[k];
                if (!a) continue;
                var colLabel = "Column " + (k + 1) + ":";
                if (a.type === "single") {
                    var s = colLabel + " cell style \"" + (a.styleName || "") + "\"";
                    if (a.skip > 0) s += ", skip " + a.skip + " header row(s)";
                    if (a.paragraphStyleName) s += ", para: " + a.paragraphStyleName;
                    if (a.columnWidth) s += ", width: " + (Math.round(a.columnWidth / 72 * 100) / 100) + " in";
                    if (a.rowHeight) s += ", height: " + (Math.round(a.rowHeight / 72 * 100) / 100) + " in";
                    if (a.mergeRows) s += ", merge rows " + (a.mergeRows.top + 1) + "-" + (a.mergeRows.bottom + 1);
                    lines.push(s);
                } else {
                    var posStrs = [];
                    for (var pk in a.positions) if (a.positions.hasOwnProperty(pk)) {
                        var pv = a.positions[pk];
                        var ps = typeof pv === "string" ? pv : ("row " + pk + ": " + (pv.styleName || "") + (pv.paragraphStyleName ? ", " + pv.paragraphStyleName : ""));
                        if (typeof pv === "object" && pv.rowHeight) ps += ", ht: " + (Math.round(pv.rowHeight / 72 * 100) / 100) + " in";
                        posStrs.push(ps);
                    }
                    var s2 = colLabel + " alternating (" + posStrs.join(" | ") + ")";
                    if (a.skip > 0) s2 += ", skip " + a.skip + " header row(s)";
                    if (a.columnWidth) s2 += ", width: " + (Math.round(a.columnWidth / 72 * 100) / 100) + " in";
                    if (a.mergeRows) s2 += ", merge rows " + (a.mergeRows.top + 1) + "-" + (a.mergeRows.bottom + 1);
                    lines.push(s2);
                }
            }
            var mergedStyleIdx = ddMerged.selection ? ddMerged.selection.index : 0;
            var mergedStyleName = (mergedStyleIdx > 0 && ddMerged.selection) ? ddMerged.selection.text : null;
            var mergedParaIdx = ddMergedPara.selection ? ddMergedPara.selection.index : 0;
            var mergedParaName = (mergedParaIdx > 0 && ddMergedPara.selection) ? ddMergedPara.selection.text : null;
            var mergedH = parseFloat(etMergedHeight.text, 10);
            var mergedHIn = (isNaN(mergedH) || mergedH <= 0) ? null : (Math.round(mergedH * 100) / 100);
            if (mergedStyleName || mergedParaName || mergedHIn) {
                var mLine = "Full-width merged rows:";
                if (mergedStyleName) mLine += " cell \"" + mergedStyleName + "\"";
                if (mergedParaName) mLine += ", para " + mergedParaName;
                if (mergedHIn) mLine += ", height " + mergedHIn + " in";
                lines.push(mLine);
            }
            var zoneCfg = getZoneConfigFromUI();
            if (zoneCfg) {
                lines.push("Pricing zone: " + zoneCfg.region + " zone " + zoneCfg.zoneId + " → slug + header");
            }
            if (summaryList.removeAll) summaryList.removeAll(); else while (summaryList.items.length > 0) summaryList.remove(0);
            if (lines.length === 0) {
                summaryList.add("item", "No assignments yet. Select columns, configure, then click Assign.");
            } else {
                for (var i = 0; i < lines.length; i++) summaryList.add("item", lines[i]);
            }
            updatePreview();
        }

        ddZone.onChange = updateSummary;

        refreshPresets();
        if (presets.length > 0) loadPresetIntoState(presets[0]);

        // Footer
        var gFooter = w.add("group");
        gFooter.alignment = "right";
        gFooter.spacing = 12;
        gFooter.margins = [0, 10, 0, 0];
        gFooter.add("button", undefined, "Cancel", { name: "cancel" });
        var bApply = gFooter.add("button", undefined, "Apply", { name: "ok" });
        bApply.helpTip = "Apply all configured styles to the table";

        } catch (uiErr) {
            alert("Error building dialog: " + uiErr);
            return;
        }
        if (w.show() !== 1) {
            try { w.close(); } catch (e) {}
            return;
        }

        // Capture zone before preset reload (loadPresetIntoState resets dropdown to preset or “none”).
        var zoneToApply = zoneOptionFromIndex(ddZone.selection ? ddZone.selection.index : 0);

        // Always apply the selected preset JSON on Apply (GR1/GR3 heights, patterns, merged headers).
        if (presets.length > 0 && ddPresets.selection && ddPresets.selection.index >= 0 && ddPresets.selection.index < presets.length) {
            loadPresetIntoState(presets[ddPresets.selection.index]);
        }

        // Show progress immediately when Apply is clicked.
        var progressWin = new Window("palette", "Applying styles...", undefined, { closeButton: true });
        progressWin.orientation = "column";
        progressWin.alignChildren = ["fill", "top"];
        progressWin.spacing = 8;
        progressWin.margins = 16;
        var progressPhase = progressWin.add("statictext", undefined, "Starting");
        progressPhase.preferredSize = [-1, 18];
        var progressDetail = progressWin.add("statictext", undefined, "", { multiline: true });
        progressDetail.preferredSize = [-1, 28];
        var gBarRow = progressWin.add("group");
        gBarRow.orientation = "row";
        gBarRow.alignChildren = ["fill", "center"];
        gBarRow.spacing = 8;
        var progressBar = gBarRow.add("progressbar", undefined, 0, 100);
        progressBar.preferredSize = [-1, 16];
        var progressPct = gBarRow.add("statictext", undefined, "0%");
        progressPct.preferredSize = [40, 18];
        progressPct.minimumSize = [40, 18];
        var gProgFooter = progressWin.add("group");
        gProgFooter.alignment = "right";
        var bProgCancel = gProgFooter.add("button", undefined, "Cancel", { name: "cancel" });
        progressWin.preferredSize = [380, 120];

        var userCancelled = false;
        function requestCancel() {
            userCancelled = true;
            try {
                progressPhase.text = "Cancelled";
                progressDetail.text = "Stopping...";
                app.refresh();
            } catch (e) {}
        }
        function abortIfCancelled() {
            if (userCancelled) throw { name: "CancelApply" };
        }

        bProgCancel.onClick = function () { requestCancel(); };
        progressWin.onClose = function () {
            userCancelled = true;
        };

        progressWin.show();
        try { app.refresh(); } catch (e) {}

        var lastPaintPct = -999;
        function tickProgress(pct, task, detail) {
            abortIfCancelled();
            if (pct < 0) pct = 0;
            if (pct > 100) pct = 100;
            var pctLabel = Math.round(pct) + "%";
            progressBar.value = pct;
            progressPct.text = pctLabel;
            progressPhase.text = task + " (" + pctLabel + ")";
            progressDetail.text = detail || "";
            if (pct - lastPaintPct >= 5 || pct >= 99) {
                lastPaintPct = pct;
                try { app.refresh(); } catch (e2) {}
            }
        }
        function closeProgress() {
            try { progressWin.close(); } catch (e) {}
        }

        tickProgress(1, "Preparing", "Starting apply...");

        // ---------- Re-resolve table from current selection ----------
        // User may have switched documents/tables while dialog was open; always apply to the currently selected table.
        tickProgress(2, "Preparing", "Finding table from selection...");
        doc = app.activeDocument;
        if (!doc) { closeProgress(); alert("No active document."); return; }
        try {
            sel = app.selection && app.selection.length ? app.selection[0] : null;
            table = null;
            if (sel) {
                if (sel.rows !== undefined && sel.columns !== undefined) table = sel;
                else if (sel instanceof Cell) table = sel.parent.parent;
                else if (sel.hasOwnProperty("parent") && sel.parent instanceof Cell) table = sel.parent.parent.parent;
                else if (sel.hasOwnProperty("tables") && sel.tables.length) table = sel.tables[0];
                else if (sel.hasOwnProperty("insertionPoints") && sel.insertionPoints.length && sel.insertionPoints[0].tables.length) table = sel.insertionPoints[0].tables[0];
            }
            if (!table || !table.isValid) {
                closeProgress();
                alert("Please select a table cell in the target table, then run the script again.");
                return;
            }
            colCount = table.columns.length;
            rowCount = table.rows.length;
            tickProgress(3, "Preparing", "Table found: " + colCount + " cols, " + rowCount + " rows");
        } catch (e) {
            closeProgress();
            alert("Could not resolve table from selection: " + e);
            return;
        }

        tickProgress(4, "Preparing", "Checking configuration...");

        // ---------- Validate (style names resolved via buildStyleCaches) ----------
        var assignedCols = [];
        for (var k in colAssignments) if (colAssignments.hasOwnProperty(k)) assignedCols.push(parseInt(k, 10));
        var mergedStyleIdx = ddMerged.selection ? ddMerged.selection.index : 0;
        var mergedStyleName = (mergedStyleIdx > 0 && ddMerged.selection) ? ddMerged.selection.text : null;
        var mergedParaIdx = ddMergedPara.selection ? ddMergedPara.selection.index : 0;
        var mergedParaName = (mergedParaIdx > 0 && ddMergedPara.selection) ? ddMergedPara.selection.text : null;
        var mergedHeightVal = parseFloat(etMergedHeight.text, 10);
        var mergedRowHeight = (isNaN(mergedHeightVal) || mergedHeightVal <= 0) ? null : mergedHeightVal * 72;

        if (assignedCols.length === 0 && !mergedStyleName && !mergedRowHeight) {
            closeProgress();
            alert("Configure at least one: column assignments, or cell style / row height for full-width merged cells.");
            return;
        }

        function buildStyleCaches(assignments, mergedStyleName, mergedParaName) {
            var cellCache = {};
            var paraCache = {};
            var hasParaStyles = false;
            function cacheCell(name) {
                if (!name) return null;
                if (cellCache[name]) return cellCache[name];
                var s = doc.cellStyles.itemByName(name);
                if (!s.isValid) throw new Error("Cell style not found: " + name);
                cellCache[name] = s;
                return s;
            }
            function cachePara(name) {
                if (!name) return null;
                if (paraCache[name]) return paraCache[name];
                var p = doc.paragraphStyles.itemByName(name);
                if (!p.isValid) throw new Error("Paragraph style not found: " + name);
                paraCache[name] = p;
                hasParaStyles = true;
                return p;
            }
            if (mergedStyleName) cacheCell(mergedStyleName);
            if (mergedParaName) cachePara(mergedParaName);
            for (var ck in assignments) if (assignments.hasOwnProperty(ck)) {
                var a = assignments[ck];
                if (a.type === "single") {
                    cacheCell(a.styleName);
                    cachePara(a.paragraphStyleName);
                } else {
                    for (var pk in a.positions) if (a.positions.hasOwnProperty(pk)) {
                        var pv = a.positions[pk];
                        cacheCell(typeof pv === "string" ? pv : pv.styleName);
                        if (typeof pv === "object" && pv.paragraphStyleName) cachePara(pv.paragraphStyleName);
                    }
                }
            }
            return { cell: cellCache, para: paraCache, hasPara: hasParaStyles };
        }

        tickProgress(5, "Preparing", "Validating cell and paragraph styles...");
        var styleCaches;
        try {
            styleCaches = buildStyleCaches(colAssignments, mergedStyleName, mergedParaName);
        } catch (cacheErr) {
            closeProgress();
            alert(String(cacheErr.message || cacheErr));
            return;
        }

        function applyParaToCell(cell, paraStyle) {
            if (!paraStyle || !paraStyle.isValid) return;
            try {
                if (cell.texts && cell.texts.length > 0) {
                    cell.texts[0].paragraphs.everyItem().appliedParagraphStyle = paraStyle;
                }
            } catch (e) {}
        }

        function applyParaToColumnCells(colCells, skip, rowCount, paraStyle) {
            if (!paraStyle || !paraStyle.isValid) return;
            try {
                if (skip <= 0) {
                    colCells.everyItem().texts.everyItem().paragraphs.everyItem().appliedParagraphStyle = paraStyle;
                    return;
                }
                if (skip < rowCount) {
                    colCells.itemByRange(skip, rowCount - 1).texts.everyItem().paragraphs.everyItem().appliedParagraphStyle = paraStyle;
                }
            } catch (e) {
                for (var r = skip; r < rowCount; r++) {
                    try { applyParaToCell(colCells[r], paraStyle); } catch (e2) {}
                }
            }
        }

        function setRowHeight(table, rowIndex, rowHt) {
            if (!rowHt) return;
            try {
                var rowObj = table.rows[rowIndex];
                if (!rowObj || !rowObj.isValid) return;
                var heightIn = rowHt / 72;
                if (rowObj.autoGrow !== undefined) rowObj.autoGrow = false;
                if (rowObj.height !== undefined) {
                    rowObj.height = heightIn;
                } else if (rowObj.minimumHeight !== undefined) {
                    rowObj.minimumHeight = heightIn;
                }
            } catch (e) {}
        }

        function applyCellStyleBatch(colCells, skip, rowCount, style) {
            if (!style || !style.isValid) return false;
            try {
                if (skip <= 0) {
                    colCells.everyItem().appliedCellStyle = style;
                } else if (skip < rowCount) {
                    colCells.itemByRange(skip, rowCount - 1).everyItem().appliedCellStyle = style;
                } else {
                    return false;
                }
                return true;
            } catch (e) {
                return false;
            }
        }

        function canBatchEntirePatternColumn(cycle, posStyles) {
            var refStyle = null;
            var refPara = null;
            for (var p = 1; p <= cycle; p++) {
                var ps = posStyles[p];
                if (!ps || !ps.style || !ps.style.isValid) return false;
                if (refStyle === null) {
                    refStyle = ps.style;
                    refPara = ps.para;
                } else {
                    if (ps.style !== refStyle) return false;
                    if (ps.para !== refPara) return false;
                }
            }
            return true;
        }

        function areColIndicesContiguous(colIndices) {
            if (!colIndices || colIndices.length < 2) return colIndices && colIndices.length === 1;
            for (var ci = 1; ci < colIndices.length; ci++) {
                if (colIndices[ci] !== colIndices[ci - 1] + 1) return false;
            }
            return true;
        }

        function applyCellStyleBatchMulti(colIndices, skip, rowCount, style) {
            if (!style || !style.isValid || !colIndices || colIndices.length === 0) return false;
            if (colIndices.length === 1) {
                return applyCellStyleBatch(table.columns[colIndices[0]].cells, skip, rowCount, style);
            }
            if (skip <= 0 && areColIndicesContiguous(colIndices)) {
                try {
                    table.columns.itemByRange(colIndices[0], colIndices[colIndices.length - 1]).cells.everyItem().appliedCellStyle = style;
                    return true;
                } catch (e) {}
            }
            var ok = false;
            for (var bmi = 0; bmi < colIndices.length; bmi++) {
                if (applyCellStyleBatch(table.columns[colIndices[bmi]].cells, skip, rowCount, style)) ok = true;
            }
            return ok;
        }

        function applyParaToColumnCellsMulti(colIndices, skip, rowCount, paraStyle) {
            if (!paraStyle || !paraStyle.isValid || !colIndices || colIndices.length === 0) return;
            if (colIndices.length === 1) {
                applyParaToColumnCells(table.columns[colIndices[0]].cells, skip, rowCount, paraStyle);
                return;
            }
            if (skip <= 0 && areColIndicesContiguous(colIndices)) {
                try {
                    table.columns.itemByRange(colIndices[0], colIndices[colIndices.length - 1]).cells.everyItem().texts.everyItem().paragraphs.everyItem().appliedParagraphStyle = paraStyle;
                    return;
                } catch (e) {}
            }
            for (var pmi = 0; pmi < colIndices.length; pmi++) {
                applyParaToColumnCells(table.columns[colIndices[pmi]].cells, skip, rowCount, paraStyle);
            }
        }

        function applyPatternOverrideMulti(colIndices, rowIndex, style, paraStyle, styleDiffers, paraDiffers) {
            try {
                if (colIndices.length === 1) {
                    var oneCell = table.columns[colIndices[0]].cells[rowIndex];
                    if (!oneCell || !oneCell.isValid) return 0;
                    if (styleDiffers) oneCell.appliedCellStyle = style;
                    if (paraDiffers && paraStyle) applyParaToCell(oneCell, paraStyle);
                    return 1;
                }
                if (areColIndicesContiguous(colIndices)) {
                    var rowCells = table.rows[rowIndex].cells;
                    if (rowCells && rowCells.length >= colCount) {
                        if (styleDiffers) {
                            rowCells.itemByRange(colIndices[0], colIndices[colIndices.length - 1]).everyItem().appliedCellStyle = style;
                        }
                        if (paraDiffers && paraStyle) {
                            for (var pi = 0; pi < colIndices.length; pi++) {
                                var pCell = rowCells[colIndices[pi]];
                                if (pCell && pCell.isValid) applyParaToCell(pCell, paraStyle);
                            }
                        }
                        return colIndices.length;
                    }
                }
                var count = 0;
                for (var omi = 0; omi < colIndices.length; omi++) {
                    var cell = table.columns[colIndices[omi]].cells[rowIndex];
                    if (!cell || !cell.isValid) continue;
                    if (styleDiffers) cell.appliedCellStyle = style;
                    if (paraDiffers && paraStyle) applyParaToCell(cell, paraStyle);
                    count++;
                }
                return count;
            } catch (e) {
                var fbCount = 0;
                for (var fbi = 0; fbi < colIndices.length; fbi++) {
                    try {
                        var fbCell = table.columns[colIndices[fbi]].cells[rowIndex];
                        if (!fbCell || !fbCell.isValid) continue;
                        if (styleDiffers) fbCell.appliedCellStyle = style;
                        if (paraDiffers && paraStyle) applyParaToCell(fbCell, paraStyle);
                        fbCount++;
                    } catch (e2) {}
                }
                return fbCount;
            }
        }

        function assignmentHasRowHeight(ass) {
            if (!ass) return false;
            if (ass.type === "single") return !!ass.rowHeight;
            for (var p = 1; p <= ass.cycle; p++) {
                var pv = ass.positions[p];
                if (pv && typeof pv === "object" && pv.rowHeight) return true;
            }
            return false;
        }

        function patternAssignmentKey(ass) {
            var parts = ["p", ass.cycle, ass.skip || 0];
            for (var pak = 1; pak <= ass.cycle; pak++) {
                var pv = ass.positions[pak];
                if (!pv) {
                    parts.push("");
                    continue;
                }
                var sn = typeof pv === "string" ? pv : pv.styleName;
                var pn = (typeof pv === "object" && pv.paragraphStyleName) ? pv.paragraphStyleName : "";
                parts.push(sn + "\t" + pn);
            }
            return parts.join("|");
        }

        function buildPosStylesFromAssignment(pcAss, cellCache, paraCache) {
            var posStyles = [];
            for (var pcPos = 1; pcPos <= pcAss.cycle; pcPos++) {
                var pcPv = pcAss.positions[pcPos];
                if (!pcPv) {
                    posStyles[pcPos] = null;
                    continue;
                }
                var pcSn = typeof pcPv === "string" ? pcPv : pcPv.styleName;
                posStyles[pcPos] = {
                    style: cellCache[pcSn],
                    para: (typeof pcPv === "object" && pcPv.paragraphStyleName) ? paraCache[pcPv.paragraphStyleName] : null
                };
            }
            return posStyles;
        }

        function patternGroupLabel(colIndices, groupIdx, groupTotal) {
            if (colIndices.length === 1) {
                return "Column " + (colIndices[0] + 1) + " (pattern, " + groupIdx + " of " + groupTotal + ")";
            }
            if (areColIndicesContiguous(colIndices)) {
                return "Columns " + (colIndices[0] + 1) + "-" + (colIndices[colIndices.length - 1] + 1) + " (pattern batch, " + groupIdx + " of " + groupTotal + ")";
            }
            var names = [];
            for (var gli = 0; gli < colIndices.length; gli++) names.push(colIndices[gli] + 1);
            return "Columns " + names.join(",") + " (pattern, " + groupIdx + " of " + groupTotal + ")";
        }

        // Same batch+override rules as applyPatternColumn; groups identical pricing columns for speed.
        function applyPatternGroup(group, rowCount, colLabel, pct) {
            var colIndices = group.colIndices;
            var skip = group.skip;
            var cycle = group.cycle;
            var posStyles = group.posStyles;
            var colCountInGroup = colIndices.length;
            var affected = Math.max(0, rowCount - skip) * colCountInGroup;
            if (affected === 0) return 0;

            if (canBatchEntirePatternColumn(cycle, posStyles)) {
                var uniform = posStyles[1];
                tickProgress(pct, "Cell styles", colLabel + " - batch entire column");
                if (applyCellStyleBatchMulti(colIndices, skip, rowCount, uniform.style)) {
                    if (hasParaStyles && uniform.para) {
                        tickProgress(pct, "Paragraph styles", colLabel + " - batch entire column");
                        applyParaToColumnCellsMulti(colIndices, skip, rowCount, uniform.para);
                    }
                    return affected;
                }
            }

            var base = posStyles[1];
            var baseStyle = base && base.style && base.style.isValid ? base.style : null;
            var basePara = base && base.para ? base.para : null;
            var usedBatch = false;
            if (baseStyle) {
                tickProgress(pct, "Cell styles", colLabel + " - batch base pattern");
                usedBatch = applyCellStyleBatchMulti(colIndices, skip, rowCount, baseStyle);
            }
            if (usedBatch && hasParaStyles && basePara) {
                tickProgress(pct, "Paragraph styles", colLabel + " - batch base pattern");
                applyParaToColumnCellsMulti(colIndices, skip, rowCount, basePara);
            }

            var styled = 0;
            var startPos = usedBatch ? 2 : 1;
            var needsOverrides = false;
            for (var checkPos = startPos; checkPos <= cycle; checkPos++) {
                var cps = posStyles[checkPos];
                if (!cps || !cps.style || !cps.style.isValid) continue;
                if (!usedBatch || cps.style !== baseStyle || (hasParaStyles && cps.para !== basePara)) {
                    needsOverrides = true;
                    break;
                }
            }

            if (needsOverrides) {
                tickProgress(pct, "Cell styles", colLabel + " - applying pattern overrides");
            }

            for (var pos = startPos; pos <= cycle; pos++) {
                var ps = posStyles[pos];
                if (!ps || !ps.style || !ps.style.isValid) continue;
                var styleDiffers = !usedBatch || ps.style !== baseStyle;
                var paraDiffers = hasParaStyles && ps.para !== basePara;
                if (usedBatch && !styleDiffers && !paraDiffers) continue;

                if (paraDiffers && !styleDiffers) {
                    tickProgress(pct, "Paragraph styles", colLabel + " - row overrides (R" + pos + "+)");
                }

                for (var pr = skip + pos - 1; pr < rowCount; pr += cycle) {
                    if (pr % 50 === 0) abortIfCancelled();
                    styled += applyPatternOverrideMulti(colIndices, pr, ps.style, ps.para, styleDiffers, paraDiffers);
                }
            }

            if (usedBatch) return affected;
            return styled;
        }

        function applySingleColumn(colCells, skip, rowCount, style, para, colLabel, pct) {
            var affected = Math.max(0, rowCount - skip);
            if (!style || !style.isValid) return 0;
            tickProgress(pct, "Cell styles", colLabel + " - batch entire column");
            if (applyCellStyleBatch(colCells, skip, rowCount, style)) {
                if (hasParaStyles && para) {
                    tickProgress(pct, "Paragraph styles", colLabel + " - batch entire column");
                    applyParaToColumnCells(colCells, skip, rowCount, para);
                }
                return affected;
            }
            tickProgress(pct, "Cell styles", colLabel + " - cell-by-cell fallback");
            var count = 0;
            for (var sr = skip; sr < rowCount; sr++) {
                if (sr % 50 === 0) abortIfCancelled();
                try {
                    var sCell = colCells[sr];
                    if (sCell && sCell.isValid) {
                        sCell.appliedCellStyle = style;
                        count++;
                        if (hasParaStyles && para) applyParaToCell(sCell, para);
                    }
                } catch (e) {}
            }
            if (hasParaStyles && para && count > 0) {
                tickProgress(pct, "Paragraph styles", colLabel + " - applied with cell styles");
            }
            return count;
        }

        // ---------- Apply ----------
        var appliedCount = 0;
        var applyStarted = new Date().getTime();
        var cellStyleCache = styleCaches.cell;
        var paraStyleCache = styleCaches.para;
        var hasParaStyles = styleCaches.hasPara;

        var oldUI = app.scriptPreferences.userInteractionLevel;
        var oldRedraw = app.scriptPreferences.enableRedraw;
        app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;

        var savedHUnit = doc.viewPreferences.horizontalMeasurementUnits;
        var savedVUnit = doc.viewPreferences.verticalMeasurementUnits;
        doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.INCHES;
        doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.INCHES;

        var applyWasCancelled = false;
        var zoneApplyMessage = "";

        try {
            app.scriptPreferences.enableRedraw = false;

            // Column widths - direct per-column access only (never prefetch all columns).
            var widthColIndices = [];
            for (var wci = 0; wci < colCount; wci++) {
                var wa = colAssignments[wci];
                if (wa && wa.columnWidth) widthColIndices.push(wci);
            }
            var widthColTotal = widthColIndices.length;
            for (var wi = 0; wi < widthColTotal; wi++) {
                abortIfCancelled();
                var cw = widthColIndices[wi];
                var widthAss = colAssignments[cw];
                var wPct = 6 + Math.round(3 * (wi + 1) / Math.max(widthColTotal, 1));
                tickProgress(wPct, "Column widths", "Column " + (wi + 1) + " of " + widthColTotal);
                try { table.columns[cw].width = widthAss.columnWidth / 72; } catch (e) {}
            }

            tickProgress(10, "Row heights", "Precomputing row height rules");
            var rowHeights = [];
            var rhSourceCol = -1;
            for (var rhFind = 0; rhFind < colCount; rhFind++) {
                if (assignmentHasRowHeight(colAssignments[rhFind])) {
                    rhSourceCol = rhFind;
                    break;
                }
            }
            if (rhSourceCol >= 0) {
                var rhAss = colAssignments[rhSourceCol];
                var rhSkip = rhAss.skip || 0;
                for (var rhRow = rhSkip; rhRow < rowCount; rhRow++) {
                    var rhVal = null;
                    if (rhAss.type === "single") {
                        rhVal = rhAss.rowHeight;
                    } else {
                        var rhPos = ((rhRow - rhSkip) % rhAss.cycle) + 1;
                        var rhPv = rhAss.positions[rhPos];
                        if (rhPv && typeof rhPv === "object") rhVal = rhPv.rowHeight;
                    }
                    if (rhVal) rowHeights[rhRow] = rhVal;
                }
            }
            tickProgress(12, "Row heights", rhSourceCol >= 0 ? ("Applying row heights (from column " + (rhSourceCol + 1) + ")") : "Applying row heights");
            for (var rhApply = 0; rhApply < rowCount; rhApply++) {
                if (rhApply % 25 === 0) abortIfCancelled();
                if (rowHeights[rhApply]) setRowHeight(table, rhApply, rowHeights[rhApply]);
            }

            tickProgress(15, "Cell styles", "Building pattern column groups");
            var patternGroups = [];
            var curPatternGroup = null;
            for (var pcIdx = 0; pcIdx < colCount; pcIdx++) {
                var pcAss = colAssignments[pcIdx];
                if (!pcAss || pcAss.type !== "pattern") {
                    curPatternGroup = null;
                    continue;
                }
                var pcKey = patternAssignmentKey(pcAss);
                if (curPatternGroup && curPatternGroup.key === pcKey && pcIdx === curPatternGroup.colIndices[curPatternGroup.colIndices.length - 1] + 1) {
                    curPatternGroup.colIndices.push(pcIdx);
                } else {
                    curPatternGroup = {
                        key: pcKey,
                        colIndices: [pcIdx],
                        skip: pcAss.skip || 0,
                        cycle: pcAss.cycle,
                        posStyles: buildPosStylesFromAssignment(pcAss, cellStyleCache, paraStyleCache)
                    };
                    patternGroups.push(curPatternGroup);
                }
            }

            var singleColCount = 0;
            for (var scCheck = 0; scCheck < colCount; scCheck++) {
                if (colAssignments[scCheck] && colAssignments[scCheck].type === "single") singleColCount++;
            }

            var singleIdx = 0;
            for (var sc = 0; sc < colCount; sc++) {
                var sAss = colAssignments[sc];
                if (!sAss || sAss.type !== "single") continue;

                singleIdx++;
                var scPct = 18 + Math.round(6 * singleIdx / Math.max(singleColCount, 1));
                var scLabel = "Column " + (sc + 1) + " (single, " + singleIdx + " of " + singleColCount + ")";

                var sSkip = sAss.skip || 0;
                var sColCells = table.columns[sc].cells;
                var sStyle = cellStyleCache[sAss.styleName];
                var sPara = sAss.paragraphStyleName ? paraStyleCache[sAss.paragraphStyleName] : null;
                appliedCount += applySingleColumn(sColCells, sSkip, rowCount, sStyle, sPara, scLabel, scPct);
            }

            var patternGroupCount = patternGroups.length;
            for (var pgiApply = 0; pgiApply < patternGroupCount; pgiApply++) {
                var pg = patternGroups[pgiApply];
                var pgPct = 24 + Math.round(66 * (pgiApply + 1) / Math.max(patternGroupCount, 1));
                var pgLabel = patternGroupLabel(pg.colIndices, pgiApply + 1, patternGroupCount);
                appliedCount += applyPatternGroup(pg, rowCount, pgLabel, pgPct);
            }

            if (mergedStyleName || mergedRowHeight) {
                if (mergedRowHeight) tickProgress(92, "Row heights", "Full-width merged rows");
                if (mergedStyleName) tickProgress(94, "Cell styles", "Full-width merged rows");
                var mergedStyle = mergedStyleName ? cellStyleCache[mergedStyleName] : null;
                var mergedPara = mergedParaName ? paraStyleCache[mergedParaName] : null;
                var mergedFound = 0;
                for (var mr = 0; mr < rowCount; mr++) {
                    if (mr % 50 === 0) abortIfCancelled();
                    try {
                        var mergedRowCells = table.rows[mr].cells;
                        // Full-width merged rows have fewer cells than the column count.
                        if (!mergedRowCells || mergedRowCells.length >= colCount) continue;
                        var mergedCellCount = mergedRowCells.length;
                        for (var ci = 0; ci < mergedCellCount; ci++) {
                            var c = mergedRowCells[ci];
                            if (c && c.isValid && c.columnSpan >= colCount) {
                                mergedFound++;
                                if (mergedRowHeight) setRowHeight(table, mr, mergedRowHeight);
                                if (mergedStyle && mergedStyle.isValid) {
                                    c.appliedCellStyle = mergedStyle;
                                    appliedCount++;
                                    if (hasParaStyles && mergedPara) applyParaToCell(c, mergedPara);
                                }
                                if (mergedFound % 5 === 0) {
                                    tickProgress(94 + Math.min(5, Math.round(mergedFound / 2)), "Cell styles", "Merged row " + mergedFound + " (row " + (mr + 1) + ")");
                                }
                                break;
                            }
                        }
                    } catch (e) {}
                }
            }

            if (zoneToApply) {
                tickProgress(99, "Pricing zone", zoneToApply.region + " zone " + zoneToApply.id);
                var zoneResult = applyPricingZone(doc, table, zoneToApply);
                zoneApplyMessage = zoneResult.ok ? ("\n\n" + zoneResult.message) : ("\n\nZone warning: " + zoneResult.message);
            } else {
                zoneApplyMessage = "\n\nPricing zone: not changed — pick a zone in the dropdown (not “(none)”).";
            }

            tickProgress(100, "Complete", "All steps finished");
        } catch (applyErr) {
            if (applyErr && applyErr.name === "CancelApply") {
                applyWasCancelled = true;
            } else {
                throw applyErr;
            }
        } finally {
            doc.viewPreferences.horizontalMeasurementUnits = savedHUnit;
            doc.viewPreferences.verticalMeasurementUnits = savedVUnit;
            app.scriptPreferences.userInteractionLevel = oldUI;
            app.scriptPreferences.enableRedraw = oldRedraw;
        }

        closeProgress();
        if (applyWasCancelled) {
            alert("Cancelled.\n\nUse Edit > Undo to revert any changes from this run.");
            return;
        }
        var applySeconds = Math.round((new Date().getTime() - applyStarted) / 1000);
        alert("Done.\nApplied styles to " + appliedCount + " cell(s).\nTime: " + applySeconds + "s" + zoneApplyMessage);
    }

    // Run with single-undo when possible (one Undo reverses all changes)
    if (!ensureInDesignHost()) return;
    try {
        $.global.__cellStyleMain = main;
        app.doScript("$.global.__cellStyleMain();", ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Apply Cell Style Pattern");
    } catch (e) {
        main();
    }

})();
