import {frameArea} from "./frameArea.js";
import {dumpObject} from "./dumpObject.js";

const loader = document.querySelector('#loader'); // Get loader
const perentageLoaded = document.querySelector('#perentageLoaded'); // Get percentage
const startButton = document.querySelector('#startButton'); // Get startButton
const secondFloor = document.querySelector('#secondFloor'); // Get secondFloor
const thirdFloor = document.querySelector('#thirdFloor'); // Get thirdFloor
const BigLectureHall = document.querySelector('#BigLectureHall'); // BigLectureHall
const entrance = document.querySelector('#entrance'); // Get  entrance
const cafeteria = document.querySelector('#cafeteria'); // Get cafeteria
const Laboratories = document.querySelector('#laboratory'); // Get Laborato
const block = document.querySelector('#block'); // Get startButton


const blocker = document.querySelector('#blocker');
const instructions = document.querySelector('#instructions');


const position = document.querySelector('#position');


export const gltfSetup = (scene, orbitControls, camera, canvas) => {

  const gltfLoader = new THREE.GLTFLoader();

  gltfLoader.load('./models/informatics_5_4.glb', (gltf) => {


      // Treats all mesh materials as individual entities
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
        }
      });


      const root = gltf.scene;
      const glasses = root.children.filter((children) => {
        const properties = children.name.split('_');
        return properties[0] === 'glass';
      });


      glasses.forEach((glass) => {
        if (glass.children.length) {
          glass.children[1].material.transparent = true;
          glass.children[1].material.transparency = 0.1;
          glass.children[1].material.color = {r: 240, g: 248, b: 255};
          glass.children[1].material.opacity = 0.2;

        }
      })

      scene.add(root);


      // compute the box that contains all the stuff
      // from root and below
      const box = new THREE.Box3().setFromObject(root);

      const boxSize = box.getSize(new THREE.Vector3()).length();
      const boxCenter = box.getCenter(new THREE.Vector3());
      // set the camera to frame the box
      frameArea(boxSize, boxSize, boxCenter, camera);

      // update the Trackball controls to handle the new size
      // orbitControls.maxDistance = boxSize * 4;
      orbitControls.target.copy(boxCenter);
    },
    (xhr) => {
      const percentage = (xhr.loaded / xhr.total * 100);
      perentageLoaded.innerHTML = `${percentage.toFixed(0)}`;
      if (percentage === 100) {
        setTimeout(() => {
          canvas.style.visibility = 'visible';
          canvas.style.visibility = 'visible';

          startButton.style.visibility = 'visible';
          secondFloor.style.visibility = 'visible';
          thirdFloor.style.visibility = 'visible';
           instructions.style.visibility = 'visible';
          blocker.style.visibility = 'visible';
          BigLectureHall.style.visibility = 'visible';
          Laboratories.style.visibility = 'visible';
          block.style.visibility = 'visible';


          cafeteria.style.visibility = 'visible';
          entrance.style.visibility = 'visible';
          position.style.visibility = 'visible';


          loader.style.visibility = 'hidden'
        }, 1000)
      }
    }, (error) => {
      console.log('An error happened', error);
    });


  gltfLoader.load('./models/tree_tut2.glb', (gltf) => {
    const originalTree = gltf.scene;

    let x = 4400;
    for (let i = 0; i < 6; i++) {
      const tree = originalTree.clone();
       tree.position.set(x, 0, -4500);
      // tree.position.set(x, 0, -8500);

      tree.scale.set(15, 15, 10);
      scene.add(tree);
      x -= 1700
    }
  })
}
