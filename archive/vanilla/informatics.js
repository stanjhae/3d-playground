import {gltfSetup} from "./utils/gltfSetup.js";
import {cameraSetup} from "./utils/cameraSetup.js";
import {orbitControlsSetup} from "./utils/orbitControlsSetup.js";
import {pointerControlsSetup} from "./utils/pointerCotrolsSetup.js";
import {lightSetup} from "./utils/lightSetup.js";
import {groundSetup} from "./utils/groundSetup.js";
import {render} from "./utils/render.js";
 import {locations} from "./utils/locations.js";

const blocker = document.querySelector('#blocker');
const instructions = document.querySelector('#instructions');
const block = document.querySelector('#block');



(() => {
  const movement = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    reset: false
  }

  const velocity = new THREE.Vector3(0, 100, 0);

  const canvas = document.querySelector('#informatics'); // Get canvas
  const renderer = new THREE.WebGLRenderer({canvas});

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7ac4f0');

  // Camera
  const camera = cameraSetup()

  // Controls
  const orbitControls = orbitControlsSetup(camera, canvas)
  const pointerControls = pointerControlsSetup(camera, canvas, velocity, scene, movement);

  // Light (Further experiments needed)
  lightSetup(scene);

  // Ground texture and material
  groundSetup(scene)

  //GLTF Informatics
  gltfSetup(scene, orbitControls, camera, canvas)

  locations(camera, velocity, pointerControls);

  instructions.addEventListener('click', function () {
    pointerControls.lock()
    instructions.style.visibility = 'hidden';
    blocker.style.visibility = 'hidden';
  });
  block.addEventListener('click', function () {
    instructions.style.visibility = 'visible';
    blocker.style.visibility = 'visible';
    block.style.visibility='visible';
  });

  //render
  requestAnimationFrame(() => render(scene, camera, renderer, pointerControls, movement, velocity));
})()
