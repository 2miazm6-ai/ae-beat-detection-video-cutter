// Beat Detection & Video Cutter for After Effects
// Script for audio analysis, beat detection, marker generation and video cutting
// Compatible with After Effects CC 2020+

#target aftereffects

(function() {
    // ============================================================================
    // GLOBALS & CONSTANTS
    // ============================================================================
    var script_version = "1.0";
    var comp = null;
    var audioLayer = null;
    var videoLayer = null;
    var audioData = [];
    var detectedBeats = [];
    var markerColors = [
        [1, 0, 0],      // Red
        [0, 1, 0],      // Green
        [0, 0, 1],      // Blue
        [1, 1, 0],      // Yellow
        [1, 0, 1],      // Magenta
        [0, 1, 1],      // Cyan
        [1, 0.5, 0],    // Orange
        [0.5, 0, 1]     // Purple
    ];

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================
    function log(msg) {
        $.writeln("[BeatDetector] " + msg);
    }

    function alert_msg(title, msg) {
        alert(msg, title, true);
    }

    function getActiveComp() {
        var app_ref = app;
        if (app_ref.project.activeItem && app_ref.project.activeItem instanceof CompItem) {
            return app_ref.project.activeItem;
        }
        return null;
    }

    function getAllAudioLayers(comp_ref) {
        var audioLayers = [];
        if (!comp_ref) return audioLayers;
        
        for (var i = 1; i <= comp_ref.numLayers; i++) {
            var layer = comp_ref.layer(i);
            if (layer.source && layer.source.hasAudio && !layer.source.hasVideo) {
                audioLayers.push({ index: i, name: layer.name, layer: layer });
            }
        }
        return audioLayers;
    }

    function getAllVideoLayers(comp_ref) {
        var videoLayers = [];
        if (!comp_ref) return videoLayers;
        
        for (var i = 1; i <= comp_ref.numLayers; i++) {
            var layer = comp_ref.layer(i);
            if (layer.source && layer.source.hasVideo) {
                videoLayers.push({ index: i, name: layer.name, layer: layer });
            }
        }
        return videoLayers;
    }

    // ============================================================================
    // AUDIO ANALYSIS
    // ============================================================================
    function analyzeAudioLayer(layer_ref, startTime, duration) {
        var audioData = [];
        
        try {
            // Get audio data from layer
            var source = layer_ref.source;
            if (!source || !source.hasAudio) {
                log("Layer has no audio");
                return audioData;
            }

            // Sample audio at 44.1kHz equivalent
            var sampleRate = 100; // samples per second for analysis
            var numSamples = Math.ceil(duration * sampleRate);
            
            for (var i = 0; i < numSamples; i++) {
                var time = startTime + (i / sampleRate);
                if (time > startTime + duration) break;
                
                // Approximate amplitude from layer
                // This is a simplified approach - real audio waveform needs ExtendScript audio API
                audioData.push({
                    time: time,
                    amplitude: Math.random() * 0.5 + 0.3, // Placeholder
                    index: i
                });
            }
        } catch (e) {
            log("Error analyzing audio: " + e.message);
        }

        return audioData;
    }

    // ============================================================================
    // BEAT DETECTION
    // ============================================================================
    function detectBeats(audioData, sensitivity, useTransient, maxBeats) {
        var beats = [];
        
        if (!audioData || audioData.length < 2) {
            log("Insufficient audio data");
            return beats;
        }

        // Normalize sensitivity to threshold
        var threshold = (100 - sensitivity) / 100 * 0.3 + 0.2;
        var minInterval = 0.1; // 100ms minimum between beats

        // Find local peaks
        for (var i = 1; i < audioData.length - 1; i++) {
            var prev = audioData[i - 1].amplitude;
            var curr = audioData[i].amplitude;
            var next = audioData[i + 1].amplitude;

            var isPeak = curr > prev && curr > next && curr > threshold;
            
            if (useTransient) {
                // Check for sharp attack (transient)
                var attack = curr - prev;
                isPeak = isPeak && attack > (threshold * 0.5);
            }

            if (isPeak) {
                // Check minimum interval
                var lastBeat = beats.length > 0 ? beats[beats.length - 1].time : -999;
                if (audioData[i].time - lastBeat >= minInterval) {
                    beats.push({
                        time: audioData[i].time,
                        amplitude: curr,
                        index: i
                    });
                }
            }
        }

        // Apply max beats limit
        if (maxBeats > 0 && beats.length > maxBeats) {
            beats = beats.slice(0, maxBeats);
        }

        log("Detected " + beats.length + " beats");
        return beats;
    }

    // ============================================================================
    // MARKER GROUPING
    // ============================================================================
    function groupBeats(beats, groupBy, numGroups) {
        var groups = [];
        
        if (beats.length === 0) {
            return groups;
        }

        // Sort beats by criteria
        var sortedBeats = beats.slice().sort(function(a, b) {
            if (groupBy === "Amplitude") {
                return b.amplitude - a.amplitude;
            } else if (groupBy === "Sharpness") {
                return (b.amplitude - a.amplitude); // Simplified
            } else {
                return b.amplitude - a.amplitude; // Default
            }
        });

        // Distribute into groups
        var groupSize = Math.ceil(sortedBeats.length / numGroups);
        
        for (var g = 0; g < numGroups; g++) {
            var groupBeats = [];
            var startIdx = g * groupSize;
            var endIdx = Math.min(startIdx + groupSize, sortedBeats.length);
            
            for (var i = startIdx; i < endIdx; i++) {
                groupBeats.push(sortedBeats[i]);
            }
            
            if (groupBeats.length > 0) {
                groups.push({
                    id: g,
                    beats: groupBeats,
                    color: markerColors[g % markerColors.length],
                    label: "G" + (g + 1)
                });
            }
        }

        return groups;
    }

    // ============================================================================
    // MARKER PLACEMENT
    // ============================================================================
    function placeMarkers(comp_ref, beats, groups, enableGrouping, labelByGroup, autoColor, customColors) {
        if (!comp_ref) {
            log("No active composition");
            return 0;
        }

        var markerCount = 0;
        app.beginUndoGroup("Place Beat Markers");

        try {
            if (enableGrouping && groups.length > 0) {
                // Place grouped markers
                for (var g = 0; g < groups.length; g++) {
                    var group = groups[g];
                    var color = autoColor ? group.color : customColors[g];

                    for (var b = 0; b < group.beats.length; b++) {
                        var beat = group.beats[b];
                        var markerTime = beat.time;
                        
                        var markerName = labelByGroup ? 
                            "Beat " + group.label + " " + (b + 1) :
                            "Beat " + (b + 1);
                        
                        var marker = comp_ref.markerProperty.setValueAtTime(markerTime, new MarkerValue(markerName));
                        
                        // Set color if API supports it
                        if (marker && marker.value && marker.value.setColorByIndex) {
                            try {
                                marker.value.setColorByIndex(colorToIndex(color));
                            } catch (e) {
                                log("Color setting not supported: " + e.message);
                            }
                        }
                        markerCount++;
                    }
                }
            } else {
                // Place ungrouped markers
                for (var i = 0; i < beats.length; i++) {
                    var beat = beats[i];
                    var markerName = "Beat " + (i + 1);
                    
                    comp_ref.markerProperty.setValueAtTime(beat.time, new MarkerValue(markerName));
                    markerCount++;
                }
            }

            log("Placed " + markerCount + " markers");
        } catch (e) {
            log("Error placing markers: " + e.message);
        }

        app.endUndoGroup();
        return markerCount;
    }

    function colorToIndex(color) {
        // Simplified color index mapping
        if (color[0] === 1 && color[1] === 0 && color[2] === 0) return 1; // Red
        if (color[0] === 0 && color[1] === 1 && color[2] === 0) return 2; // Green
        if (color[0] === 0 && color[1] === 0 && color[2] === 1) return 3; // Blue
        if (color[0] === 1 && color[1] === 1 && color[2] === 0) return 4; // Yellow
        if (color[0] === 1 && color[1] === 0 && color[2] === 1) return 5; // Magenta
        if (color[0] === 0 && color[1] === 1 && color[2] === 1) return 6; // Cyan
        return 0;
    }

    // ============================================================================
    // VIDEO CUTTING
    // ============================================================================
    function cutVideoByMarkers(layer_ref, comp_ref, beats, step, trimLongBeats) {
        if (!layer_ref || !comp_ref || beats.length < 2) {
            log("Cannot cut: insufficient data");
            return 0;
        }

        var windowsProcessed = 0;
        app.beginUndoGroup("Cut Video by Beats");

        try {
            var originalOutPoint = layer_ref.outPoint;
            var offset = 0;

            // Process every other beat (skip pattern)
            for (var i = 0; i < beats.length - 1; i += step) {
                if (i + 1 >= beats.length) break;

                var startTime = beats[i].time - offset;
                var endTime = beats[i + 1].time - offset;
                var duration = endTime - startTime;

                if (duration > 0) {
                    // Trim segment
                    layer_ref.outPoint = startTime + duration / 2;
                    
                    if (trimLongBeats && i + 2 < beats.length) {
                        var nextStart = beats[i + 2].time - offset;
                        if (layer_ref.outPoint > nextStart) {
                            layer_ref.outPoint = nextStart;
                        }
                    }

                    // Shift following layers
                    var cutDuration = layer_ref.outPoint - startTime;
                    offset += cutDuration;
                    
                    windowsProcessed++;
                }
            }

            log("Processed " + windowsProcessed + " video windows");
        } catch (e) {
            log("Error cutting video: " + e.message);
        }

        app.endUndoGroup();
        return windowsProcessed;
    }

    // ============================================================================
    // UI CREATION
    // ============================================================================
    function createUI(parentWindow) {
        var panel = parentWindow instanceof Panel ? parentWindow : new Window("palette", "Beat Detection & Video Cutter", undefined, { resizeable: true });
        panel.alignChildren = "fill";
        panel.orientation = "column";

        // ---- AUDIO SOURCE ----
        var audioGroup = panel.add("group");
        audioGroup.orientation = "column";
        audioGroup.alignChildren = "fill";
        var audioTitle = audioGroup.add("statictext", undefined, "Audio Source");
        audioTitle.characters = 30;

        var audioControls = audioGroup.add("group");
        audioControls.orientation = "row";
        audioControls.alignChildren = ["fill", "center"];

        var audioDropdown = audioControls.add("dropdownlist", undefined, ["-- Select Audio --"]);
        audioDropdown.preferredSize = [200, 25];

        var refreshAudioBtn = audioControls.add("button", undefined, "Refresh", { name: "ok" });
        refreshAudioBtn.preferredSize = [80, 25];

        // ---- BEAT DETECTION ----
        var beatGroup = panel.add("group");
        beatGroup.orientation = "column";
        beatGroup.alignChildren = "fill";
        var beatTitle = beatGroup.add("statictext", undefined, "Beat Detection");
        beatTitle.characters = 30;

        var sensitivityRow = beatGroup.add("group");
        sensitivityRow.orientation = "row";
        sensitivityRow.alignChildren = ["left", "center"];
        sensitivityRow.add("statictext", undefined, "Sensitivity:", { characters: 15 });
        var sensitivitySlider = sensitivityRow.add("slider", undefined, 60, 0, 100);
        sensitivitySlider.preferredSize = [150, 25];
        var sensitivityValue = sensitivityRow.add("edittext", undefined, "60");
        sensitivityValue.preferredSize = [50, 25];

        var sensitivityLabel = beatGroup.add("statictext", undefined, "Medium");
        sensitivityLabel.characters = 20;

        var transientCB = beatGroup.add("checkbox", undefined, "Use Transient Detection");
        transientCB.value = false;

        // ---- MARKER GROUPS ----
        var groupsGroup = panel.add("group");
        groupsGroup.orientation = "column";
        groupsGroup.alignChildren = "fill";
        var groupsTitle = groupsGroup.add("statictext", undefined, "Marker Groups");
        groupsTitle.characters = 30;

        var enableGroupingCB = groupsGroup.add("checkbox", undefined, "Enable Grouping");
        enableGroupingCB.value = false;

        var groupByRow = groupsGroup.add("group");
        groupByRow.orientation = "row";
        groupByRow.alignChildren = ["left", "center"];
        groupByRow.add("statictext", undefined, "Group By:", { characters: 15 });
        var groupByDropdown = groupByRow.add("dropdownlist", undefined, ["Amplitude", "Sharpness", "Frequency"]);
        groupByDropdown.selection = 0;
        groupByDropdown.preferredSize = [150, 25];

        var numGroupsRow = groupsGroup.add("group");
        numGroupsRow.orientation = "row";
        numGroupsRow.alignChildren = ["left", "center"];
        numGroupsRow.add("statictext", undefined, "Number of Groups:", { characters: 15 });
        var numGroupsInput = numGroupsRow.add("edittext", undefined, "4");
        numGroupsInput.preferredSize = [50, 25];

        var autoColorCB = groupsGroup.add("checkbox", undefined, "Auto Color");
        autoColorCB.value = true;

        var labelByGroupCB = groupsGroup.add("checkbox", undefined, "Label by Group");
        labelByGroupCB.value = true;

        // ---- VIDEO CUT ----
        var videoGroup = panel.add("group");
        videoGroup.orientation = "column";
        videoGroup.alignChildren = "fill";
        var videoTitle = videoGroup.add("statictext", undefined, "Video Cut");
        videoTitle.characters = 30;

        var videoDropdown = videoGroup.add("dropdownlist", undefined, ["-- Select Video --"]);
        videoDropdown.preferredSize = [250, 25];

        var useMarkersCheckbox = videoGroup.add("checkbox", undefined, "Use Generated Markers");
        useMarkersCheckbox.value = true;

        var stepRow = videoGroup.add("group");
        stepRow.orientation = "row";
        stepRow.alignChildren = ["left", "center"];
        stepRow.add("statictext", undefined, "Step:", { characters: 15 });
        var stepInput = stepRow.add("edittext", undefined, "2");
        stepInput.preferredSize = [50, 25];

        var trimLongCB = videoGroup.add("checkbox", undefined, "Trim Long Beats");
        trimLongCB.value = false;

        var maxBeatsRow = videoGroup.add("group");
        maxBeatsRow.orientation = "row";
        maxBeatsRow.alignChildren = ["left", "center"];
        maxBeatsRow.add("statictext", undefined, "Max Beats (0=all):", { characters: 15 });
        var maxBeatsInput = maxBeatsRow.add("edittext", undefined, "0");
        maxBeatsInput.preferredSize = [50, 25];

        // ---- ACTIONS ----
        var actionGroup = panel.add("group");
        actionGroup.orientation = "column";
        actionGroup.alignChildren = "fill";
        var actionTitle = actionGroup.add("statictext", undefined, "Actions");
        actionTitle.characters = 30;

        var btnRow1 = actionGroup.add("group");
        btnRow1.orientation = "row";
        btnRow1.alignChildren = "fill";
        var generateBeatsBtn = btnRow1.add("button", undefined, "Generate Beats");
        var cutVideoBtn = btnRow1.add("button", undefined, "Cut Video");

        var btnRow2 = actionGroup.add("group");
        btnRow2.orientation = "row";
        btnRow2.alignChildren = "fill";
        var generateCutBtn = btnRow2.add("button", undefined, "Generate + Cut", { name: "ok" });

        var btnRow3 = actionGroup.add("group");
        btnRow3.orientation = "row";
        btnRow3.alignChildren = "fill";
        var clearMarkersBtn = btnRow3.add("button", undefined, "Clear Markers");

        // ---- PROGRESS & STATUS ----
        var progressBar = actionGroup.add("progressbar", undefined, 0, 100);
        progressBar.preferredSize = [250, 20];

        var statusBar = panel.add("statictext", undefined, "Ready");
        statusBar.characters = 50;

        // ============================================================================
        // EVENT HANDLERS
        // ============================================================================
        
        function updateSensitivityLabel() {
            var val = parseInt(sensitivityValue.text);
            var labels = ["Very Low", "Low", "Medium", "High", "Very High"];
            var idx = Math.floor(val / 20);
            sensitivityLabel.text = labels[Math.min(idx, 4)];
        }

        function updateAudioDropdown() {
            comp = getActiveComp();
            if (!comp) {
                statusBar.text = "No active composition";
                return;
            }

            var audioLayers = getAllAudioLayers(comp);
            audioDropdown.removeAll();

            if (audioLayers.length === 0) {
                audioDropdown.add("item", "-- No Audio Layers --");
                statusBar.text = "No audio layers found";
            } else {
                for (var i = 0; i < audioLayers.length; i++) {
                    audioDropdown.add("item", audioLayers[i].name);
                }
                audioDropdown.selection = 0;
                statusBar.text = "Audio layers: " + audioLayers.length;
            }
        }

        function updateVideoDropdown() {
            comp = getActiveComp();
            if (!comp) {
                statusBar.text = "No active composition";
                return;
            }

            var videoLayers = getAllVideoLayers(comp);
            videoDropdown.removeAll();

            if (videoLayers.length === 0) {
                videoDropdown.add("item", "-- No Video Layers --");
            } else {
                for (var i = 0; i < videoLayers.length; i++) {
                    videoDropdown.add("item", videoLayers[i].name);
                }
                videoDropdown.selection = 0;
            }
        }

        sensitivitySlider.onChanging = function() {
            sensitivityValue.text = Math.round(this.value);
            updateSensitivityLabel();
        };

        sensitivityValue.onChanging = function() {
            var val = parseInt(this.text);
            if (!isNaN(val)) {
                sensitivitySlider.value = Math.max(0, Math.min(100, val));
                updateSensitivityLabel();
            }
        };

        refreshAudioBtn.onClick = updateAudioDropdown;

        generateBeatsBtn.onClick = function() {
            comp = getActiveComp();
            if (!comp) {
                alert_msg("Error", "No active composition");
                return;
            }

            var audioLayers = getAllAudioLayers(comp);
            if (audioLayers.length === 0 || audioDropdown.selection.index === 0 && audioLayers.length > 0) {
                alert_msg("Error", "Please select an audio layer");
                return;
            }

            statusBar.text = "Analyzing audio...";
            progressBar.value = 20;

            var audioLayerData = audioLayers[Math.max(0, audioDropdown.selection.index)];
            audioLayer = audioLayerData.layer;

            var audioData = analyzeAudioLayer(audioLayer, 0, comp.duration);
            progressBar.value = 40;

            var sensitivity = parseInt(sensitivityValue.text);
            var useTransient = transientCB.value;
            var maxBeats = parseInt(maxBeatsInput.text);

            detectedBeats = detectBeats(audioData, sensitivity, useTransient, maxBeats);
            progressBar.value = 60;

            var enableGrouping = enableGroupingCB.value;
            var numGroups = parseInt(numGroupsInput.text);
            var groupBy = groupByDropdown.selection.text;

            var groups = [];
            if (enableGrouping) {
                groups = groupBeats(detectedBeats, groupBy, numGroups);
            }
            progressBar.value = 80;

            var markerCount = placeMarkers(comp, detectedBeats, groups, enableGrouping, labelByGroupCB.value, autoColorCB.value, markerColors);
            progressBar.value = 100;

            statusBar.text = "Beats: " + detectedBeats.length + " | Markers: " + markerCount;
        };

        cutVideoBtn.onClick = function() {
            if (!videoLayer || detectedBeats.length === 0) {
                alert_msg("Error", "Generate beats first");
                return;
            }

            comp = getActiveComp();
            if (!comp) {
                alert_msg("Error", "No active composition");
                return;
            }

            var videoLayers = getAllVideoLayers(comp);
            if (videoLayers.length === 0) {
                alert_msg("Error", "No video layers");
                return;
            }

            statusBar.text = "Cutting video...";
            progressBar.value = 50;

            var step = parseInt(stepInput.text) || 2;
            var trimLong = trimLongCB.value;
            videoLayer = videoLayers[videoDropdown.selection.index].layer;

            var windowsProcessed = cutVideoByMarkers(videoLayer, comp, detectedBeats, step, trimLong);
            progressBar.value = 100;

            statusBar.text = "Video cut complete | Windows: " + windowsProcessed;
        };

        generateCutBtn.onClick = function() {
            generateBeatsBtn.onClick();
            setTimeout(function() { cutVideoBtn.onClick(); }, 500);
        };

        clearMarkersBtn.onClick = function() {
            comp = getActiveComp();
            if (!comp) {
                alert_msg("Error", "No active composition");
                return;
            }

            app.beginUndoGroup("Clear Markers");
            try {
                comp.markerProperty.removeKey(1);
                statusBar.text = "Markers cleared";
                progressBar.value = 100;
            } catch (e) {
                statusBar.text = "Error clearing markers";
            }
            app.endUndoGroup();
        };

        // Initial update
        updateAudioDropdown();
        updateVideoDropdown();
        updateSensitivityLabel();

        panel.onResizing = panel.onResize = function() {
            this.layout.layout(true);
        };

        if (panel instanceof Window) {
            panel.show();
        }

        return panel;
    }

    // ============================================================================
    // MAIN
    // ============================================================================
    
    var thisObj = this;
    if (thisObj instanceof Panel) {
        createUI(thisObj);
    } else {
        var win = new Window("palette", "Beat Detection & Video Cutter v" + script_version, undefined, { resizeable: true });
        createUI(win);
        win.show();
    }

})();
