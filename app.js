var express = require("express");
var midi = require('midi'),
    app = express(),
    port = process.env.PORT || 9000,
    server = require('http').createServer(app),
    io = require('socket.io').listen(server);

    // set up our express application
app.use(express.static(__dirname + '/public')); // for static resources in the public folder
app.set('view engine', 'ejs'); // set up ejs for templating

// Set up a new input.
var input = new midi.input();
// Count the available input ports.
if (input.getPortCount() > 0){
    // Get the name of a specified input port.
    input.getPortName(0);
    // Open the first available input port.
    input.openPort(0);

    // Configure a callback.
    input.on('message', function(deltaTime, message) {
      //var msg = '1: m:' + message + ' d:' + deltaTime;
      message.push(deltaTime);
      console.log(message);
      io.sockets.emit('midiMessage', message);
    });
}

app.get('/', function(req, res) {
    console.log("GET /");
    res.render('index');
});

// when a client connects to the server,
io.sockets.on('connection', function(socket) {
    console.log("listener connected");
});


// tells the server to listen to port 9000
server.listen(port);
console.log('app started on port '+port);
