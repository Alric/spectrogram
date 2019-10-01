
// Shim
window.AudioContext = window.AudioContext || window.webkitAudioContext;
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia;
window.URL = window.URL || window.webkitURL;
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

try {
  audioContext = new AudioContext();
} catch (e) {
  console.log('No web audio support in this browser!');
  alert('No web audio support in this browser!');
}

var FFT_SIZE = 8192*2;
var MAX_FREQUENCY = 2000;

var canvas = document.getElementById('canvas');
canvas.width = window.innerWidth;
canvas.height = MAX_FREQUENCY*FFT_SIZE/44100; // Guess. We reset this inside connectAnalyser after getting the real sampling rate

var color = _.memoize(d3.interpolateYlGnBu, function(n){ return n.toFixed(2);});

var ctx = canvas.getContext('2d');
ctx.fillStyle = color(0);

// 1. Get access to microphone
var mic = null;
navigator.getUserMedia({video: false, audio: true}, connectAnalyser, console.error);

function connectAnalyser(stream) {
  console.log("Connected to Microphone");
  console.log(stream);

  var streamSource = audioContext.createMediaStreamSource(stream);
  var analyser = audioContext.createAnalyser();

  // Customize analyser
  analyser.smoothingTimeConstant = 0;
  analyser.fftSize = FFT_SIZE;

  streamSource.connect(analyser);

  mic = audioContext.createBufferSource();
  mic.analyser = analyser;

  // Reset canvas height if needed based on true sampleRate.
  canvas.height = MAX_FREQUENCY*FFT_SIZE/mic.context.sampleRate;
}

// 2. Collect Audio Data during recording.

var recording = false;
var collectedAudioData = [];

var timeOffset = Date.now()/1000;
function getAudioData(currentTime){
  if(!recording) return;
  window.requestAnimationFrame(getAudioData);

  var audioData = new Float32Array(mic.analyser.frequencyBinCount);
  mic.analyser.getFloatFrequencyData(audioData);
  var time = timeOffset + mic.analyser.context.currentTime; // Note that requestAnimaFrame currentTime is ms
  // mic.context.currentTime is also available, but I assume mic.analyser.context.currentTime \
  // represents the actual time that has been processed by this node vs current record time?

  collectedAudioData.push({time:time, audioData:audioData});
  drawSpectrum(audioData);
}

// 2b. UI
var recordButton = document.getElementById('btn-record');
var stopButton = document.getElementById('btn-stop');

recordButton.addEventListener('click', record, false);
stopButton.addEventListener('click', stop, false);

function record(){
  console.log("record...");
  recording = true;
  window.requestAnimationFrame(getAudioData);
}
function stop(){
  recording = false;
}

// 2c. Render Helpers
function drawSpectrum(audioData, x){
  if(isNaN(x)) { // shift
    x = canvas.width-1;
    var d = ctx.getImageData(1,0,canvas.width-1,canvas.height);
    ctx.putImageData(d, 0, 0);
  }

  for (var i = 0; i < FFT_SIZE; i++) {
    // var freq = i * mic.context.sampleRate / FFT_SIZE; // unused for now...
    if(i > canvas.height) continue;

    ctx.fillStyle = color((audioData[i]+100)/100);
    ctx.fillRect(x,canvas.height-1-i,4,1); // overdraw slightly to reduce annoying holes.
  }
}

function xTime(time){
  var minTime = collectedAudioData[0].time;
  var maxTime = collectedAudioData[collectedAudioData.length-1].time;

  var maxWidth = (maxTime-minTime)*60; // roughly 60Hz is what we expect to render at, although it leaves some bad holes

  return maxWidth*(time-minTime)/(maxTime-minTime) + (canvas.width-maxWidth);
}

// 3. Add data from pitch tracker...
function renderAll(){
  renderSpectrogram();
  renderLines();
  renderLogs();
}

function renderSpectrogram(){
  ctx.fillStyle = 'black';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = color(0);
  var left = xTime(collectedAudioData[0].time);
  ctx.fillRect(left,0,canvas.width,canvas.height);

  _.each(collectedAudioData,function(audioSample){
    var x = xTime(audioSample.time);
    drawSpectrum(audioSample.audioData, x);
  });

}

function renderLogs(){
  if(typeof logs != 'undefined'){
  ctx.globalAlpha = 0.8;
  _.each(logs, function(log){
    var x = xTime(log.time) + mic.context.baseLatency*1000; // add mic latency in?
    var y = log.freq * (FFT_SIZE / mic.context.sampleRate);

    ctx.strokeStyle = 'tomato';
    ctx.lineWidth = 2;
    //ctx.fillRect(x,canvas.height-1-parseInt(y),8,8);
    ctx.beginPath();
    ctx.arc(x, canvas.height-1-parseInt(y), 2, 0, 2*Math.PI);
    ctx.stroke();
  });
  ctx.globalAlpha = 1.0;
  } else {
    console.log("No logs.")
  }
}

function renderLines(){
  ctx.globalAlpha = 0.25;
  for(var semitone = -12; semitone <= 36; semitone++){
    var freq = 440 * Math.pow(2,(semitone-9)/12);
    var y = freq * (FFT_SIZE / mic.context.sampleRate);
    
    ctx.fillStyle = 'thistle';
    if(semitone % 12 == 0) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'slateblue';
      ctx.globalAlpha = 0.25;
    }
    
    ctx.fillRect(0,canvas.height-1-parseInt(y),canvas.width,1);
    console.log(semitone,freq);
  }
  ctx.globalAlpha = 1.0;
}
