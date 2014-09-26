var socket,
    context = new AudioContext(),
    synthMachineProto = function (trackName) {this.init(trackName)},
    hardwareHandlerProto = function () {this.init()},
    recordManagerProto = function () {this.init()},
    mapperProto = function(name,map) {this.init(name,map)},
    musicTheoryProto = function() {this.init()},
    buttonGroupProto = function(selectionMode, map) {this.init(selectionMode,map)},
    sliderProto = function(min,max,step,name, callback) {this.init(min,max,step,name,callback)},
    viewProto = function () {this.init()};

function initSocketIO () {
    view.logToBrowser("io init", "io");
    // gets a socket object to work with
    socket = io.connect(document.location.href);
    // when the client connects to the server:
    socket.on('connect', function() {
        view.logToBrowser("Connection Established", "io");
    });
    socket.on('midiMessage', function(data) {
        hardwareHandler.interpretMidi(data);
    });
}

synthMachineProto.prototype.init = function (trackName) {
    var self = this;
    self.notesOn = {};
    self.lastNoteEvent = 0;
    self.trackName = trackName;
    recordManager.initTrack(trackName);

    self.gain = context.createGain();
    self.gain.connect(context.destination);
    self.noteSynths = {};
    for (var i=12; i<121; i++){
        self.noteSynths["note"+i] = self.createNoteSynth(i);
    }
    self.MRMap = new mapperProto("synthMachine.MRMap", [  //MIDI Responsibility Map
    {    //Map 0
         "noteOn": {ary: [145]},
         "noteOff": {ary: [129]}
    },
    {   //Map 1
        "chordOn_M": {ary:[145]},
        "chordOff_M": {ary:[129]}
    }]);
    self.MRMap.fn.noteOn = function(message){self.noteOn(message)};
    self.MRMap.fn.noteOff = function(message){self.noteOff(message)};
    self.MRMap.fn.chordOn_M = function(message){self.playNotes("On", musicTheory.M_Chord(message))};
    self.MRMap.fn.chordOff_M = function(message){self.playNotes("Off", musicTheory.M_Chord(message))};
    //self.MRMap.loadMap(self.MRMap.maps[1]);
    //self.setOscillatorType("triangle");
    console.log("synthMachine initialized");
};
synthMachineProto.prototype.createNoteSynth = function(midiNote) {
    var osc = context.createOscillator();
    var gain = context.createGain();
    osc.connect(gain);
    gain.connect(this.gain);
    gain.gain.value = 0;
    osc.frequency.value = 440 * Math.pow(2, (midiNote-69)/12);
    osc.type.value = "sine";
    osc.start();
    return {
            osc: osc, 
            gain: gain
            };
};
synthMachineProto.prototype.noteOn = function(message, future){
    try{
         var self = this;
         if(self.notesOn["note"+message.midi[1]])
            return;
         if(message.future){
            //self.noteSynths["note"+message.midi[1]].gain.gain.setValueAtTime((message.midi[2]/400),(context.currentTime+future));
            setTimeout(function(){self.noteSynths["note"+message.midi[1]].gain.gain.value = message.midi[2]/400}, message.future * 1000);
         }
         else{
            view.pianoKeyDown(message.midi[1]);
            view.logToBrowser("Note ON: "+message.midi[1], "keyboard-on");
            self.noteSynths["note"+message.midi[1]].gain.gain.value = message.midi[2]/400;
            self.notesOn["note"+message.midi[1]] = true;
         }
         if(recordManager.isRecording){
            recordManager.writeMessage(message, "synth");
         }
    } catch (e) { 
        console.log("synthMachine.noteOn broke on message: " + JSON.stringify(message));
        console.log(e);
    }
};
synthMachineProto.prototype.playNotes = function(mode, messages) {
    var self = this;
    for (msg in messages) {
        self["note"+mode](messages[msg]);
    }
}
synthMachineProto.prototype.noteOff = function(message, future){
    try{
         var self = this;
         if(message.future){
            setTimeout(function(){self.noteSynths["note"+message.midi[1]].gain.gain.value = 0}, message.future * 1000);
            //self.noteSynths["note"+message.midi[1]].gain.gain.setValueAtTime(0,(context.currentTime+future));
         }
         else{
            view.pianoKeyUp(message.midi[1]);
            view.logToBrowser("Note OFF: "+message.midi[1], "keyboard-off"); 
            self.noteSynths["note"+message.midi[1]].gain.gain.value = 0;
            delete self.notesOn["note"+message.midi[1]];
         }
         if(recordManager.isRecording){
            recordManager.writeMessage(message, "synth");
         }
    }
    catch (e) {
        console.log("synthMachine.noteOff broke on message: " + JSON.stringify(message));
        console.log(e);
    }
};
synthMachineProto.prototype.midiHandler = function(message){
    var self = this;
    self.MRMap.exe(message.midi[0],message);
}
synthMachineProto.prototype.setOscillatorType = function(type){
    var self = this;
    for(synth in self.noteSynths){
        self.noteSynths[synth].osc.type = type;
    }
};
synthMachineProto.prototype.detune = function(detune){
    var self = this;
    for (synth in self.noteSynths){
        self.noteSynths[synth].osc.detune.value = detune;
    }
}

recordManagerProto.prototype.init = function() {
    var self = this;
    self.lastNoteEvent = context.currentTime;
    self.isRecording = false;
    self.tracks = {};
    console.log("recordManager initialized");
};
recordManagerProto.prototype.initTrack = function(trackName) {
    var self = this;
    self.tracks[trackName] = {name: trackName, ary: []};
}
recordManagerProto.prototype.deltaTime = function() {
    var self = this,
        now = context.currentTime;
        deltaTime = now - self.lastNoteEvent;
    self.lastNoteEvent = now;
    return deltaTime;
};
recordManagerProto.prototype.toggleRecordingMode = function() {
    var self = this;
    self.lastNoteEvent = context.currentTime;
    self.isRecording = !self.isRecording;
};
recordManagerProto.prototype.writeMessage = function(message, trackName) {
    // TODO: implement and insert
    var self = this;
    self.tracks[trackName].ary.push(message);
}
recordManagerProto.prototype.playTrack = function(trackName) {
    var self = this;
    var totalFuture = 0;
    for(index in self.tracks[trackName].ary){
        //schedule the playing of this message
        var message = {};
        message = self.tracks[trackName].ary[index];
        totalFuture += message.midi[3];
        message.future = totalFuture;
        synthMachine.MRMap.exe(message.midi[0],message);
    }
}
// TODO: R/W MIDI files

hardwareHandlerProto.prototype.init = function() {
    var self = this;
    self.enableKeySynth = true;
    self.shiftHeld = false;
    //Hardware Responsibility Map
    self.HRMap = new mapperProto("hardwareHandler.HRMap",[{
                         "synthMidi": {ary: [65,87,83,69,68,70,84,71,89,72,85,74,75,79,76,80,186,219,222]},
                         "toggleShift": {ary: [16]}
                    }]);
    self.HRMap.fn.synthMidi = function(message){synthMachine.midiHandler(message)};
    self.HRMap.fn.toggleShift = function(){self.toggleShift()};
    self.initCompKeys();
    console.log("hardwareHandler initialized");
}
hardwareHandlerProto.prototype.toggleShift = function() {
    self.shiftHeld = !self.shiftHeld;
}
hardwareHandlerProto.prototype.initCompKeys = function() {
    var self = this;
    addEventListener("keydown", function (e) {
        var key = self.keySynthToMidi(e.keyCode);
        if(!synthMachine.notesOn["note"+key]){
            self.HRMap.exe(e.keyCode, {midi: [145, key,50, recordManager.deltaTime()]});
        }
    });

    addEventListener("keyup", function (e) {
        var key = self.keySynthToMidi(e.keyCode);
        self.HRMap.exe(e.keyCode,{midi: [129, key, 0, recordManager.deltaTime()]});
    });
}
hardwareHandlerProto.prototype.interpretMidi = function(message) {
    var self = this;
    if (!message.midi[3])
    //TODO recordManager
        message.midi.push(recordManager.deltaTime());
    self.HRMap.exe(message.midi[0],message);
}
hardwareHandlerProto.prototype.keySynthToMidi = function(keycode) {
    //TODO: handle the rest of the keycodes
   switch(keycode){
        case 65:
            return 60;
        case 87:
            return 61;
        case 83:
            return 62;
        case 69:
            return 63;
        case 68:        //D
            return 64;
        case 70:        //F
            return 65;
        case 84:        //T
            return 66;
        case 71:        //G
            return 67;
        case 89:        //Y
            return 68;
        case 72:        //H
            return 69;
        case 85:
            return 70;
        case 74:
            return 71;
        case 75:
            return 72;
        case 79:
            return 73;
        case 76:
            return 74;
        case 80:
            return 75;
        case 186:
            return 76;
        case 222:
            return 77;

   }
}
// TODO map synth detune and handle

mapperProto.prototype.init = function(name,maps) {
    var self = this;
    self.name = name;
    self.maps = maps;
    self.curMap = {};
    self.fn = {};
    self.loadMap(maps[0]);
};
mapperProto.prototype.loadMap = function(map){
    var self = this;
    for (fn in map) {
        for (elem in map[fn].ary){
            self.curMap["map"+map[fn].ary[elem]] = fn;
        }
    }
}
mapperProto.prototype.exe = function(key, data){
    var self = this;
    if(self.curMap["map"+key])
        self.fn[self.curMap["map"+key]](data);
    else 
        view.logToBrowser(self.name+" could not find a mapping for "+key,"warning");
}

musicTheoryProto.prototype.init = function(){
    var self = this;
    self.M_Chord = function(message){return self.generateChord(message,[0,4,7])};
    self.M7_Chord = function(message){return self.generateChord(message,[0,4,7,11])};
    self.m_Chord = function(message){return self.generateChord(message,[0,3,7])};
    self.m7_Chord = function(message){return self.generateChord(message,[0,3,7,11])};
    self.dim_Chord = function(message){return self.generateChord(message,[0,3,6])};
    self.aug_Chord = function(message){return self.generateChord(message,[0,4,8])};
    self.hdim7_Chord = function(message){return self.generateChord(message,[0,3,6,10])};
    console.log("musicTheory initialized");
};
musicTheoryProto.prototype.generateChord = function(message, modifiers){
    var self = this,
        root = message[1],
        id = message[0],
        weight = message[2],
        delta = message[3],
        result = [];
    for(note in modifiers){
        result.push([id,root+modifiers[note],weight,delta]);
    }
    return result;
}

viewProto.prototype.init = function(){
    var self = this;
        self.basicKeyboard = ["white","black", "white", "black", "white", "white", "black","white", "black", "white", "black", "white"];
    self.commandList = document.getElementById("commands");
    self.initPiano(48,30);
    self.initOscTypes();
    self.initRecorder();
    self.initDetuneSlider();
    console.log("view initialized");
};
viewProto.prototype.initPiano = function(lowestC, keyCount /* must be an int and greater than 12 */){
    var self = this,
        octaves = Math.floor(keyCount/12),
        remainder = keyCount % 12,
        insert = document.getElementById("piano-insert");
        container = document.createElement("div"),
        piano = document.createElement("div"),
        pcontainer = document.createElement("div");
    container.setAttribute("id", "container");
    piano.setAttribute("id", "piano");
    pcontainer.setAttribute("id", "piano-container");
    for(var octCount = 0; octCount<octaves; octCount++){
        for(var key = 0; key<self.basicKeyboard.length; key++){
            var curLi = document.createElement("li");
            var divKey = document.createElement("div");
            divKey.setAttribute("class",self.basicKeyboard[key]);
            divKey.setAttribute("id", "p"+lowestC++);
            curLi.appendChild(divKey);
            if(self.basicKeyboard[key+1] === "black"){
                var divKey2 = document.createElement("div");
                divKey2.setAttribute("class",self.basicKeyboard[key+1]);
                divKey2.setAttribute("id","p"+lowestC++);
                curLi.appendChild(divKey2);
                key++;
            }
            pcontainer.appendChild(curLi);
        }
    }
    //TODO: add remainder keys
    for(var remCount = 0; remCount<remainder; remCount++){
       var curLi = document.createElement("li");
       var divKey = document.createElement("div");
       divKey.setAttribute("class",self.basicKeyboard[remCount]);
       divKey.setAttribute("id", "p"+lowestC++);
       curLi.appendChild(divKey);
       if(self.basicKeyboard[remCount+1] === "black" && remCount+1<remainder){
           remCount++;
           var divKey2 = document.createElement("div");
           divKey2.setAttribute("class",self.basicKeyboard[remCount]);
           divKey2.setAttribute("id","p"+lowestC++);
           curLi.appendChild(divKey2);
       }
       pcontainer.appendChild(curLi);
    } 
    piano.appendChild(pcontainer);
    container.appendChild(piano);
    insert.appendChild(container);
}
viewProto.prototype.initOscTypes = function(){
    var self = this;
    self.oscBtnGroup = new buttonGroupProto("single", new mapperProto("oscType",[{
                                                                                    "setOscType": {ary:["sine", "square","triangle","sawtooth"]}
                                                                                }]));
    self.oscBtnGroup.Rmap.fn.setOscType = function(btn){ synthMachine.setOscillatorType(btn.getAttribute("id")); };
}
viewProto.prototype.initRecorder = function() {
    var self = this;
    self.recBtnGroup = new buttonGroupProto("toggle", new mapperProto("recordManager",[{
                                                                                        "toggleRecordingMode": {ary:["record"]},
                                                                                        "playTrack": {ary:["play"]}
                                                                                      }]));
    self.recBtnGroup.Rmap.fn.toggleRecordingMode = function(){recordManager.toggleRecordingMode()};
    self.recBtnGroup.Rmap.fn.playTrack = function(){recordManager.playTrack("synth");};
}
viewProto.prototype.initDetuneSlider = function() {
    var self = this;
    self.detuneSlider = new sliderProto(-150,150,1,"detune",(function(val){synthMachine.detune(val)}));
}
viewProto.prototype.pianoKeyDown = function(note){
    var elem = document.getElementById("p"+note);
    var color = elem.getAttribute("class");
    elem.setAttribute("class", color+"-active");
}
viewProto.prototype.pianoKeyUp = function(note){
    var elem = document.getElementById("p"+note);
    var color = elem.getAttribute("class").indexOf("white");
    if (color != -1)
        color = "white";
    else
        color  = "black";
    elem.setAttribute("class",color);
}
viewProto.prototype.logToBrowser = function(message, className, deltaTime) {
   // TODO: pretty delta time logging
   // TODO: error message printing
   var newCommand = document.createElement("li");
   newCommand.innerText = message;
   newCommand.setAttribute("class", className);
   if(deltaTime) {
        var timeDiv = document.createElement("div");
        timeDiv.setAttribute("class", "deltaTime");
        timeDive.innterText = deltaTime;
        newCommand.appendChild(timeDiv);
   }
   
   this.commandList.insertBefore(newCommand, this.commandList.getElementsByTagName("li")[0]);
}

buttonGroupProto.prototype.init = function(selectionMode, map){
    var self = this;
    self.buttonNames = [];
    self.buttons = []
    self.Rmap = map;
    self.name = self.Rmap.name;
    self.selectionMode = selectionMode;
    for(key in self.Rmap.curMap){(function(key){
        key = key.slice(3);
        var keyBtn = document.getElementById(key);
        self.buttonNames.push(key);
        self.buttons.push(keyBtn);
        keyBtn.onclick = function(){
                                    self.selectButton(keyBtn);
        };                            
    })(key);}
}
buttonGroupProto.prototype.setButtonMode = function(btn, mode){
    var self = this;
    var classes = btn.getAttribute("class").split(" ");
    for(clss in classes){
        if(classes[clss].indexOf(self.name) != -1){
            classes[clss] = self.name+mode;
            btn.setAttribute("class",classes.join(" "));
        }
    }
}
buttonGroupProto.prototype.selectButton = function(btn){
    var self = this;
    //TODO: Toggle mode
    //TODO: Down and up
    switch(self.selectionMode){
        case "single":
            for(button in self.buttons){
                self.setButtonMode(self.buttons[button], "-singleoff");
            }
            self.setButtonMode(btn,"-singleon");
            self.Rmap.exe(btn.getAttribute("id"), btn);
            break;
       case "toggle":
            var oldState = JSON.parse(btn.getAttribute("data-ison"));
            var newState = oldState ? "off" : "on";
            btn.setAttribute("data-ison", !oldState);
            btn.innerText = btn.getAttribute("data-"+newState) || btn.innerText;
            self.setButtonMode(btn, "-toggle"+newState);
            self.Rmap.exe(btn.getAttribute("id"), btn);
            break;
    }
}

sliderProto.prototype.init = function(min,max,step,name,callback){
    var self = this;
    self.min = min;
    self.max = max;
    self.step = step;
    self.name = name;
    self.callback = callback;
    self.elm = document.getElementById(name+"-slider");
    self.elm.oninput = function(){
                                   self.callback(self.elm.value);};
    self.elm.onmouseup = function(){self.elm.blur();};
}


// TODO: Slider class
// TODO: Drum Machine
// TODO: Effects Manager
// TODO: Effects Manager Delay
// TODO: Custom wave tables

context.createGain(); //annoyingly, chromium-based browser's AudioContext.currentTime() doesn't start incrementing until you create a node.
recordManager = new recordManagerProto();
musicTheory = new musicTheoryProto();
synthMachine = new synthMachineProto("synth");
hardwareHandler = new hardwareHandlerProto();
view = new viewProto();
initSocketIO();
