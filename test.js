var midi = require('midi');
// Set up a new input.
var input = new midi.input();
var input2 = new midi.input();
// Count the available input ports.
input.getPortCount();
input2.getPortCount();

// Get the name of a specified input port.
input.getPortName(0);
input.getPortName(0);

// Configure a callback.
input.on('message', function(deltaTime, message) {
  console.log('1: m:' + message + ' d:' + deltaTime);
});

input2.on('message', function(deltaTime, message) {
  console.log('2: m:' + message + ' d:' + deltaTime);
});

// Open the first available input port.
input.openPort(0);
input2.openPort(1);
