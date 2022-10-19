"use strict";

import { AndroidFullScreen } from "@awesome-cordova-plugins/android-full-screen";
import GUI from "lil-gui";
import * as eruda from "eruda";
import "flowbite";
import $ from "jquery";
import Stats from "stats.js";
import * as three from "three";
import { GROUPS } from "./core/groups";
import { createCamera } from "./camera.js";
import * as HALLOWEEN from "./core/halloween0.js";
import oneX from "./assets/1xalpha.png";
import twoX from "./assets/2xalpha.png";
import threeX from "./assets/3xalpha.png";
import fiveX from "./assets/5xalpha.png";
import eightX from "./assets/8xalpha.png";
import Swal from "sweetalert2";
import ClipboardJS from "clipboard";
import MobileDetect from "mobile-detect";
import screenfull from "screenfull";

import {
  createLaneNotes,
  createRailNotes,
  LANE_COLUMN,
  RAIL_COLUMN,
  TABLE_DENSITY_PER_SECOND,
} from "./core/notes.js";
import {
  createHighway,
  createJudge,
  createRailJudge,
  createRails,
  createLaneDim,
  createRailDim,
  SIDES,
  LEFT_SIDE_M4,
  RIGHT_SIDE_M4,
  SIDE_LANE_OPACITY,
  LEFT_ON_DECK_M4,
  RIGHT_ON_DECK_M4,
  LEFT_ON_DECK_QUATERNION,
  LEFT_SIDE_QUATERNION,
  LEFT_ON_DECK_POSITION,
  LEFT_SIDE_POSITION,
  MIDDLE_QUATERNION,
  MIDDLE_POSITION,
  RIGHT_SIDE_QUATERNION,
  RIGHT_SIDE_POSITION,
  RIGHT_ON_DECK_QUATERNION,
  RIGHT_ON_DECK_POSITION,
  RAIL_SIDE_QUTERNION,
  RAIL_CENTER_QUTERNION,
  RAIL_SIDE_POSITION,
  RAIL_CENTER_POSITION,
  RAIL_ROTATION,
  OFF_SCREEN_M4,
  createMultiplier,
  SIDES_CLOCKWISE,
} from "./core/plane.js";
import {
  createLaneTouchArea,
  createRailTouchArea,
  LANE_TOUCH_AREA_COLUMN,
  RAIL_TOUCH_AREA_COLUMN,
} from "./core/touch.js";
import {
  GREAT_MULTIPLIER,
  OK_MULTIPLIER,
  PERFECT_MULTIPLIER,
  SCORE_MULTIPLIERS,
} from "./core/scoring";
import { getAudioData } from "./io/soundfile";
import { doSignIn } from "./firebase/auth";
import { JUDGEMENT_CONSTANTS } from "./judgement/judgement";
import {
  bumpScore,
  claimPlayerLoop,
  createGame,
  createScore,
  getGame,
  getRank,
  listen,
  setStart,
  shiftLeft,
  shiftRight,
} from "./firebase/firestore";

// how far in the back we look to disqualify something as a miss
// change this is the TABLE_DENSITY_FACTOR is no longer 10
const REWIND_FACTOR = 4;
const md = new MobileDetect(window.navigator.userAgent);
const IS_MOBILE = md.mobile() ? true : false;
const START_DELAY = 3000;
const negMod = (x, n) => ((x % n) + n) % n;
const lerpyMcLerpLerp = (a, b, t) => a * (1 - t) + b * t;

const SHIFT_INSTRUCTION = {
  GO_LEFT: 0,
  GO_RIGHT: 1,
};

const FULL_VIDEO_OPACITY = "opacity-100";
const AUDIO_STOPS = 125.3;

const handleFullScreen = async () => {
  if (screenfull.isEnabled && IS_MOBILE) {
    await screenfull.request();
    if (screen && screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock("landscape").catch((e) => console.warn(e));
    }
  }
};

const doTimeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ROTATION_DURATION = 0.6;

const showWhoHasJoined = (title, player) =>
  listen({
    title,
    listener: async (doc) => {
      const data = doc.data();
      let html = "";
      for (var i = 1; i < 9; i++) {
        if (data["player" + i + "Name"] && i !== player) {
          html += `<div><span class="bg-zinc-600/80 p-2 text-white">${
            data["player" + i + "Name"]
          } has joined!</span></div>`;
        }
      }
      $(".who-has-joined").html(html);
    },
  });

const makeGroup = ({ scene, side, groupId, multtxt }) => {
  // thin stuff out
  const laneNotes = HALLOWEEN.SPOOKY_LANES.map((x) => {
    const o = { ...x };
    o.timing -= (60.0 * 3) / HALLOWEEN.TEMPO;
    return o;
  }).map((x) => {
    const o = { ...x };
    if (groupId % 4 === 0) {
      // do nothing
    } else if (groupId % 4 === 1) {
      // shift 1
      o.column =
        x.column === LANE_COLUMN.FAR_LEFT
          ? LANE_COLUMN.NEAR_LEFT
          : x.column === LANE_COLUMN.NEAR_LEFT
          ? LANE_COLUMN.NEAR_RIGHT
          : x.column === LANE_COLUMN.NEAR_RIGHT
          ? LANE_COLUMN.FAR_RIGHT
          : LANE_COLUMN.FAR_LEFT;
    } else if (groupId % 4 === 2) {
      // shift 2
      o.column =
        x.column === LANE_COLUMN.FAR_LEFT
          ? LANE_COLUMN.NEAR_RIGHT
          : x.column === LANE_COLUMN.NEAR_LEFT
          ? LANE_COLUMN.FAR_RIGHT
          : x.column === LANE_COLUMN.NEAR_RIGHT
          ? LANE_COLUMN.FAR_LEFT
          : LANE_COLUMN.NEAR_LEFT;
    } else {
      // shift 3
      o.column =
        x.column === LANE_COLUMN.FAR_LEFT
          ? LANE_COLUMN.FAR_RIGHT
          : x.column === LANE_COLUMN.NEAR_LEFT
          ? LANE_COLUMN.FAR_LEFT
          : x.column === LANE_COLUMN.NEAR_RIGHT
          ? LANE_COLUMN.NEAR_LEFT
          : LANE_COLUMN.NEAR_RIGHT;
    }
    return o;
  });
  const { laneNoteMesh, laneNoteInfo, laneNoteTable } = createLaneNotes({
    notes: laneNotes,
    groupId,
  });

  const sideGroup = new three.Group();
  const railGroup = new three.Group();

  sideGroup.add(laneNoteMesh);

  const quarterIs = 60.0 / HALLOWEEN.TEMPO;
  const eightBeatsAre = quarterIs * 8.0;
  const sixteenBeatsAre = quarterIs * 16.0;
  const test1 = (x) => x.timing % sixteenBeatsAre < eightBeatsAre;
  const test2 = (x) => x.timing % sixteenBeatsAre > eightBeatsAre;
  const railNotes = HALLOWEEN.SPOOKY_RAILS.map((x) => {
    const o = { ...x };
    o.timing -= (60.0 * 3) / HALLOWEEN.TEMPO;
    return o;
  }).filter(groupId % 2 === 0 ? test1 : test2);
  const { railNoteMesh, railNoteInfo, railNoteTable } = createRailNotes({
    notes: railNotes,
    groupId,
  });
  railGroup.add(railNoteMesh);

  const highway = createHighway();
  if (side !== SIDES.CENTER) {
    highway.material.opacity = SIDE_LANE_OPACITY;
  }
  sideGroup.add(highway);
  const multiplier = createMultiplier({ multtxt });
  sideGroup.add(multiplier);
  const judge = createJudge();
  sideGroup.add(judge);
  const rails = createRails({ side });
  railGroup.add(rails);
  const railJudge = createRailJudge({ side });
  railGroup.add(railJudge);

  const dims = [
    createLaneDim(LANE_COLUMN.FAR_LEFT),
    createLaneDim(LANE_COLUMN.NEAR_LEFT),
    createLaneDim(LANE_COLUMN.NEAR_RIGHT),
    createLaneDim(LANE_COLUMN.FAR_RIGHT),
    createRailDim(RAIL_COLUMN.LEFT),
    createRailDim(RAIL_COLUMN.RIGHT),
  ];
  for (const laneDim of dims) {
    sideGroup.add(laneDim);
  }
  if (side === SIDES.LEFT_SIDE) {
    sideGroup.applyMatrix4(LEFT_SIDE_M4);
  } else if (side === SIDES.RIGHT_SIDE) {
    sideGroup.applyMatrix4(RIGHT_SIDE_M4);
  }
  // nix the visibility if it is not one of the three primary lanes
  if (
    !(
      side === SIDES.LEFT_SIDE ||
      side === SIDES.RIGHT_SIDE ||
      side === SIDES.CENTER
    )
  ) {
    sideGroup.visible = false;
  }
  if (side === SIDES.CENTER) {
    railGroup.setRotationFromEuler(new three.Euler(0.0, 0.0, -RAIL_ROTATION));
  }
  railGroup.position.copy(
    side === SIDES.CENTER ? RAIL_CENTER_POSITION : RAIL_SIDE_POSITION
  );
  sideGroup.add(railGroup);
  scene.add(sideGroup);
  return {
    sideGroup,
    railGroup,
    highway,
    groupId,
    laneNoteMesh,
    laneNoteInfo,
    laneNoteTable,
    railNoteMesh,
    railNoteInfo,
    railNoteTable,
  };
};

const main = async () => {
  // dev
  const gui = new GUI();
  if (import.meta.env.PROD) {
    gui.hide();
  }
  const stats = new Stats();
  stats.showPanel(0);
  if (import.meta.env.DEV) {
    document.body.appendChild(stats.dom);
    eruda.init();
  }
  AndroidFullScreen.isImmersiveModeSupported()
    .then(() => AndroidFullScreen.immersiveMode())
    .catch(console.warn);
  // sign in
  const signInPromise = doSignIn();

  // top-level lets and consts
  const score = {
    score: 0,
    highestCombo: 0,
  };
  let gameLoopUnsub;
  let gameScoreReportingInterval;
  let comboCount = 0;
  let gamePromise = null;
  let claimPlayerPromise = null;
  let audioContext = null;
  let beginTime = null;
  let isPlaying = false;

  const togglePlayBack =
    ({ audioDataPromise, title, player, name }) =>
    async () => {
      if (audioContext) {
        audioContext.close();
      }
      audioContext = new AudioContext();
      const incoming = await audioDataPromise;

      audioContext.decodeAudioData(
        incoming,
        (buffer) => {
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContext.destination);
          source.start(audioContext.currentTime, 0.0, AUDIO_STOPS);
          source.addEventListener("ended", async () => {
            if (gameLoopUnsub) {
              gameLoopUnsub();
            }
            if (gameScoreReportingInterval) {
              clearInterval(gameScoreReportingInterval);
            }
            if (title) {
              // get all of the scores
              const game = await getGame({ title });
              let finalScore = 0;
              if (game) {
                for (var i = 1; i < 9; i++) {
                  if (game["player" + i + "Score"] && i !== player) {
                    // add half of all other players' scores
                    // plus on est de fou, plus on rit !
                    finalScore += game["player" + i + "Score"] / 2.0;
                  }
                }
              }
              finalScore += score.score;
              await createScore({ score: finalScore, name, ride: title });
              const rank = await getRank({ score: score.score });
              Swal.fire({
                title: "Congrats!",
                text: `Your final score is ${finalScore.toFixed(
                  1
                )}. Your world ranking is #${rank}.`,
                showCancelButton: true,
                cancelButtonText: "Play again",
                confirmButtonText: "Join Our Discord!",
              }).then((result) => {
                if (result.isConfirmed) {
                  window.location = "https://discord.gg/gUAPQAtbS8";
                } else {
                  window.location = "https://joyride.fm";
                }
              });
            }
          });
          beginTime = audioContext.currentTime;
          isPlaying = true;
        },

        (e) => console.error(`Error with decoding audio data: ${e.err}`)
      );
    };

  const doGame = async ({ player, practice, title }) => {
    // background
    $("#storm-video").removeClass("opacity-0");
    $("#storm-video").addClass(FULL_VIDEO_OPACITY);
    // textures
    const loader = new three.TextureLoader();
    const [t1x, t2x, t3x, t5x, t8x] = await Promise.all([
      loader.loadAsync(oneX),
      loader.loadAsync(twoX),
      loader.loadAsync(threeX),
      loader.loadAsync(fiveX),
      loader.loadAsync(eightX),
    ]);

    // canvas
    const canvas = document.getElementById("joyride-canvas");
    // renderer
    const renderer = new three.WebGLRenderer({ canvas, alpha: true });
    // camera
    const camera = createCamera(canvas.clientWidth / canvas.clientHeight);
    //raycaster
    const raycaster = new three.Raycaster();

    // scene
    const scene = new three.Scene();
    const pm1 = player - 1;
    const ALL_GROUPS = [
      makeGroup({
        scene,
        multtxt: t1x,
        side: SIDES_CLOCKWISE[negMod(0 - pm1, 8)],
        groupId: GROUPS.LOWEST,
      }),
      makeGroup({
        scene,
        multtxt: t2x,
        side: SIDES_CLOCKWISE[negMod(1 - pm1, 8)],
        groupId: GROUPS.LOW_LEFT,
      }),
      makeGroup({
        scene,
        multtxt: t3x,
        side: SIDES_CLOCKWISE[negMod(2 - pm1, 8)],
        groupId: GROUPS.MID_LEFT,
      }),
      makeGroup({
        scene,
        multtxt: t5x,
        side: SIDES_CLOCKWISE[negMod(3 - pm1, 8)],
        groupId: GROUPS.HIGH_LEFT,
      }),
      makeGroup({
        scene,
        multtxt: t8x,
        side: SIDES_CLOCKWISE[negMod(4 - pm1, 8)],
        groupId: GROUPS.HIGHEST,
      }),
      makeGroup({
        scene,
        multtxt: t5x,
        side: SIDES_CLOCKWISE[negMod(5 - pm1, 8)],
        groupId: GROUPS.HIGH_RIGHT,
      }),
      makeGroup({
        scene,
        multtxt: t3x,
        side: SIDES_CLOCKWISE[negMod(6 - pm1, 8)],
        groupId: GROUPS.MID_RIGHT,
      }),
      makeGroup({
        scene,
        multtxt: t2x,
        side: SIDES_CLOCKWISE[negMod(7 - pm1, 8)],
        groupId: GROUPS.LOW_RIGHT,
      }),
    ];

    const currentRotationAnimationTargets = [];

    let currentGroupIndex = player - 1;
    let inRotationAnimation = false;
    let rotationAnimationDirection = undefined;
    let rotationAnimationStartsAt = undefined;
    let leftSideGroup = ALL_GROUPS[negMod(player, 8)];
    let mainGroup = ALL_GROUPS[negMod(player - 1, 8)];
    let rightSideGroup = ALL_GROUPS[negMod(player - 2, 8)];

    // fb
    if (!practice) {
      gameLoopUnsub = listen({
        title,
        listener: async (doc) => {
          const data = doc.data();
          // we'eve shifted
          if (
            data["player" + player + "Position"] !==
            negMod(currentGroupIndex, 8) + 1
          ) {
            // our positions have changed
            const newIndex = negMod(
              data["player" + player + "Position"] - 1,
              8
            );
            // todo - make this more resilient to multiple shifts, ie if there are several in a row from all directions
            // the game will still sort of work in this case, but it will not be totally accurate score-wise
            const shiftingLeft =
              (newIndex > currentGroupIndex &&
                !(newIndex === 7 && currentGroupIndex === 0)) ||
              (newIndex === 0 && currentGroupIndex === 7);
            scoreSpan.text(shiftingLeft ? "Shifted left!" : "Shifted right!");
            doShift(
              shiftingLeft
                ? SHIFT_INSTRUCTION.GO_LEFT
                : SHIFT_INSTRUCTION.GO_RIGHT
            );
          }
        },
      });
      gameScoreReportingInterval = setInterval(() => {
        bumpScore({ title, player, score: score.score });
      }, 1500);
    }
    //

    const touchAreas = [
      createLaneTouchArea(LANE_TOUCH_AREA_COLUMN.FAR_LEFT),
      createLaneTouchArea(LANE_TOUCH_AREA_COLUMN.NEAR_LEFT),
      createLaneTouchArea(LANE_TOUCH_AREA_COLUMN.NEAR_RIGHT),
      createLaneTouchArea(LANE_TOUCH_AREA_COLUMN.FAR_RIGHT),
      createRailTouchArea(RAIL_TOUCH_AREA_COLUMN.LEFT),
      createRailTouchArea(RAIL_TOUCH_AREA_COLUMN.RIGHT),
    ];

    for (const touchArea of touchAreas) {
      scene.add(touchArea);
    }

    $("#intro-screen").addClass("hidden");
    $("#score-grid").removeClass("hidden");
    const scoreSpan = $("#score-text");
    const comboSpan = $("#combo-text");
    const realScore = $("#real-score");

    const context = {
      movementThreshold: 1.0,
    };

    if (import.meta.env.DEV) {
      gui
        .add(context, "movementThreshold", 0.5, 1.5)
        .name("Movement Threshold");
    }
    const tryResizeRendererToDisplay = () => {
      const canvas = renderer.domElement;
      const pixelRatio = window.devicePixelRatio;
      const width = (canvas.clientWidth * pixelRatio) | 0;
      const height = (canvas.clientHeight * pixelRatio) | 0;
      const needResize = canvas.width !== width || canvas.height !== height;
      if (needResize) {
        renderer.setSize(width, height, false);
        const canvas = renderer.domElement;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
      }
    };

    const pointerBuffer = new three.Vector2();

    const doShift = (dir) => {
      const previousGroupIndex = currentGroupIndex;
      currentGroupIndex = negMod(
        dir === SHIFT_INSTRUCTION.GO_LEFT
          ? currentGroupIndex + 1
          : currentGroupIndex - 1,
        8
      );
      if (dir === SHIFT_INSTRUCTION.GO_LEFT) {
        // do the non-animating shifts
        //// right on deck goes to not visible
        ALL_GROUPS[negMod(previousGroupIndex - 2, 8)].sideGroup.applyMatrix4(
          OFF_SCREEN_M4
        );
        //// left-most not visible goes to left on-deck
        ALL_GROUPS[negMod(previousGroupIndex + 3, 8)].sideGroup.applyMatrix4(
          LEFT_ON_DECK_M4
        );
        //// set the visibility of left-on-deck to true
        ALL_GROUPS[negMod(previousGroupIndex + 2, 8)].sideGroup.visible = true;
        //// set the animation targets
        ////// set left on deck to left
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex + 2, 8)].sideGroup,
          qstart: LEFT_ON_DECK_QUATERNION,
          qend: LEFT_SIDE_QUATERNION,
          pstart: LEFT_ON_DECK_POSITION,
          pend: LEFT_SIDE_POSITION,
        });
        ////// set left to main
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex + 1, 8)].sideGroup,
          qstart: LEFT_SIDE_QUATERNION,
          qend: MIDDLE_QUATERNION,
          pstart: LEFT_SIDE_POSITION,
          pend: MIDDLE_POSITION,
        });
        ////// set left rail to tilted
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex + 1, 8)].railGroup,
          qstart: RAIL_SIDE_QUTERNION,
          qend: RAIL_CENTER_QUTERNION,
          pstart: RAIL_SIDE_POSITION,
          pend: RAIL_CENTER_POSITION,
        });
        ////// set main rail to untilted
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex, 8)].railGroup,
          qstart: RAIL_CENTER_QUTERNION,
          qend: RAIL_SIDE_QUTERNION,
          pstart: RAIL_CENTER_POSITION,
          pend: RAIL_SIDE_POSITION,
        });
        ////// set main to right
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex, 8)].sideGroup,
          qstart: MIDDLE_QUATERNION,
          qend: RIGHT_SIDE_QUATERNION,
          pstart: MIDDLE_POSITION,
          pend: RIGHT_SIDE_POSITION,
        });
        ////// set right to right on deck
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex - 1, 8)].sideGroup,
          qstart: RIGHT_SIDE_QUATERNION,
          qend: RIGHT_ON_DECK_QUATERNION,
          pstart: RIGHT_SIDE_POSITION,
          pend: RIGHT_ON_DECK_POSITION,
        });
      } else {
        // do the non-animating shifts
        //// left on deck goes to not visible
        ALL_GROUPS[negMod(previousGroupIndex + 2, 8)].sideGroup.applyMatrix4(
          OFF_SCREEN_M4
        );
        //// right-most not visible goes to right on-deck
        ALL_GROUPS[negMod(previousGroupIndex - 3, 8)].sideGroup.applyMatrix4(
          RIGHT_ON_DECK_M4
        );
        //// set the visibility of right-on-deck to true
        ALL_GROUPS[negMod(previousGroupIndex - 2, 8)].sideGroup.visible = true;
        //// set the animation targets
        ////// set right on deck to right
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex - 2, 8)].sideGroup,
          qstart: RIGHT_ON_DECK_QUATERNION,
          qend: RIGHT_SIDE_QUATERNION,
          pstart: RIGHT_ON_DECK_POSITION,
          pend: RIGHT_SIDE_POSITION,
        });
        ////// set right to main
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex - 1, 8)].sideGroup,
          qstart: RIGHT_SIDE_QUATERNION,
          qend: MIDDLE_QUATERNION,
          pstart: RIGHT_SIDE_POSITION,
          pend: MIDDLE_POSITION,
        });
        ////// set right rail to tilted
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex - 1, 8)].railGroup,
          qstart: RAIL_SIDE_QUTERNION,
          qend: RAIL_CENTER_QUTERNION,
          pstart: RAIL_SIDE_POSITION,
          pend: RAIL_CENTER_POSITION,
        });
        ////// set main rail to untilted
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex, 8)].railGroup,
          qstart: RAIL_CENTER_QUTERNION,
          qend: RAIL_SIDE_QUTERNION,
          pstart: RAIL_CENTER_POSITION,
          pend: RAIL_SIDE_POSITION,
        });
        ////// set main to left
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex, 8)].sideGroup,
          qstart: MIDDLE_QUATERNION,
          qend: LEFT_SIDE_QUATERNION,
          pstart: MIDDLE_POSITION,
          pend: LEFT_SIDE_POSITION,
        });
        ////// set left to left on deck
        currentRotationAnimationTargets.push({
          target: ALL_GROUPS[negMod(previousGroupIndex + 1, 8)].sideGroup,
          qstart: LEFT_SIDE_QUATERNION,
          qend: LEFT_ON_DECK_QUATERNION,
          pstart: LEFT_SIDE_POSITION,
          pend: LEFT_ON_DECK_POSITION,
        });
      }
      mainGroup = ALL_GROUPS[currentGroupIndex];
      leftSideGroup = ALL_GROUPS[negMod(currentGroupIndex + 1, 8)];
      rightSideGroup = ALL_GROUPS[negMod(currentGroupIndex - 1, 8)];
      inRotationAnimation = true;
      rotationAnimationDirection = dir;
    };

    const handleTouch = (event) => {
      if (!isPlaying) {
        return;
      }
      const elapsedTime = audioContext.currentTime - beginTime;

      for (const touch of IS_MOBILE ? event.changedTouches : [event]) {
        pointerBuffer.x = (touch.clientX / window.innerWidth) * 2 - 1;
        pointerBuffer.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointerBuffer, camera);
        const intersects = raycaster.intersectObjects(touchAreas);
        if (intersects.length === 0) {
          continue;
        }
        const index = Math.floor(elapsedTime * TABLE_DENSITY_PER_SECOND);
        const activeLanes = mainGroup.laneNoteTable[index];
        // rails are always represented on the left
        // so we take the rightSideGroup to represent the left rail
        const activeRails = mainGroup.railNoteTable[index].concat(
          ...rightSideGroup.railNoteTable[index]
        );

        for (const {
          object: { uuid },
        } of intersects) {
          //// start loop

          const touchIndex = touchAreas.findIndex(
            (element) => element.uuid === uuid
          ); // 0,1,2,3 is the highway, 4 is the left, 5 is the right

          const latestLaneNote =
            touchIndex > 3 || activeLanes[touchIndex] === undefined
              ? undefined
              : mainGroup.laneNoteInfo[activeLanes[touchIndex]];
          if (
            latestLaneNote &&
            elapsedTime >
              latestLaneNote.timing -
                JUDGEMENT_CONSTANTS.CONSIDERATION_WINDOW &&
            elapsedTime <
              latestLaneNote.timing + JUDGEMENT_CONSTANTS.CONSIDERATION_WINDOW
          ) {
            const untilPerfect = Math.abs(elapsedTime - latestLaneNote.timing);
            let scoreMultiplier = undefined;
            if (untilPerfect < JUDGEMENT_CONSTANTS.PERFECTION) {
              comboCount += 1;
              scoreMultiplier;
              scoreSpan.text("Perfect!");
              comboSpan.text(comboCount);
              latestLaneNote.hasHit = true;
              scoreMultiplier = PERFECT_MULTIPLIER;
            } else if (untilPerfect < JUDGEMENT_CONSTANTS.ALMOST) {
              comboCount += 1;
              scoreSpan.text("Nice");
              comboSpan.text(comboCount);
              latestLaneNote.hasHit = true;
              scoreMultiplier = GREAT_MULTIPLIER;
            } else {
              comboCount += 1;
              scoreSpan.text("Almost");
              comboSpan.text(comboCount);
              latestLaneNote.hasHit = true;
              scoreMultiplier = OK_MULTIPLIER;
            }
            score.score +=
              scoreMultiplier *
              (1 + comboCount) *
              SCORE_MULTIPLIERS[mainGroup.groupId];
            score.highestCombo = Math.max(score.highestCombo, comboCount);
            realScore.text(score.score.toFixed(1));
          }
          const latestRailNote =
            touchIndex === 4 && activeRails[0] !== undefined
              ? mainGroup.railNoteInfo[activeRails[0]]
              : touchIndex === 5 && activeRails[1] !== undefined
              ? rightSideGroup.railNoteInfo[activeRails[1]]
              : undefined;
          if (
            latestRailNote &&
            elapsedTime > latestRailNote.timing - 0.1 &&
            elapsedTime < latestRailNote.timing + 0.1
          ) {
            practice
              ? scoreSpan.text(
                  touchIndex === 4 ? "Shift Left!" : "Shift Right!"
                )
              : scoreSpan.text(
                  touchIndex === 4 ? "Requesting left!" : "Requesting right!"
                );
            comboSpan.text("");
            latestRailNote.hasHit = true;
            if (practice) {
              // the firebase callback won't pick this up so we trigger it here
              doShift(
                touchIndex === 4
                  ? SHIFT_INSTRUCTION.GO_LEFT
                  : SHIFT_INSTRUCTION.GO_RIGHT
              );
            }
            touchIndex === 4
              ? shiftLeft({ title, player })
              : shiftRight({ title, player });
          }
          /// end loop
        }
      }
    };

    if (!IS_MOBILE) {
      document.documentElement.addEventListener("click", handleTouch);
    } else {
      document.documentElement.addEventListener("touchstart", handleTouch);
    }

    const renderLoop = () => {
      raycaster.setFromCamera(pointerBuffer, camera);

      if (isPlaying) {
        const elapsedTime = audioContext.currentTime - beginTime;
        if (inRotationAnimation) {
          if (rotationAnimationStartsAt === undefined) {
            rotationAnimationStartsAt = elapsedTime;
          }
          if (elapsedTime > ROTATION_DURATION + rotationAnimationStartsAt) {
            // set the final
            for (const target of currentRotationAnimationTargets) {
              target.target.quaternion.copy(target.qend);
              target.target.position.copy(target.pend);
            }
            // remove visibility of anything that would have become invisible
            if (rotationAnimationDirection === SHIFT_INSTRUCTION.GO_LEFT) {
              // something to the far off right should be invisible
              ALL_GROUPS[negMod(currentGroupIndex - 2, 8)].visible = false;
              mainGroup.highway.material.opacity = 1.0;
              rightSideGroup.highway.material.opacity = SIDE_LANE_OPACITY;
            } else {
              // something to the far off left should be invisible
              ALL_GROUPS[negMod(currentGroupIndex + 2, 8)].visible = false;
              mainGroup.highway.material.opacity = 1.0;
              leftSideGroup.highway.material.opacity = SIDE_LANE_OPACITY;
            }
            // then set everything to false and empty the targets
            inRotationAnimation = false;
            rotationAnimationStartsAt = undefined;
            // do not display shift any longer
            scoreSpan.text("");
            currentRotationAnimationTargets.length = 0;
          } else {
            const NORMALIZED_TIME =
              (elapsedTime - rotationAnimationStartsAt) / ROTATION_DURATION;
            if (rotationAnimationDirection === SHIFT_INSTRUCTION.GO_LEFT) {
              mainGroup.highway.material.opacity = lerpyMcLerpLerp(
                SIDE_LANE_OPACITY,
                1.0,
                NORMALIZED_TIME
              );
              rightSideGroup.highway.material.opacity = lerpyMcLerpLerp(
                1.0,
                SIDE_LANE_OPACITY,
                NORMALIZED_TIME
              );
            } else {
              mainGroup.highway.material.opacity = lerpyMcLerpLerp(
                SIDE_LANE_OPACITY,
                1.0,
                NORMALIZED_TIME
              );
              leftSideGroup.highway.material.opacity = lerpyMcLerpLerp(
                1.0,
                SIDE_LANE_OPACITY,
                NORMALIZED_TIME
              );
            }
            for (const target of currentRotationAnimationTargets) {
              target.target.quaternion.copy(
                target.qstart.clone().slerp(target.qend, NORMALIZED_TIME)
              );
              target.target.position.copy(
                target.pstart.clone().lerp(target.pend, NORMALIZED_TIME)
              );
            }
          }
        }
        mainGroup.laneNoteMesh.material.uniforms.uTime.value = elapsedTime;
        mainGroup.railNoteMesh.material.uniforms.uTime.value = elapsedTime;
        leftSideGroup.laneNoteMesh.material.uniforms.uTime.value = elapsedTime;
        leftSideGroup.railNoteMesh.material.uniforms.uTime.value = elapsedTime;
        rightSideGroup.laneNoteMesh.material.uniforms.uTime.value = elapsedTime;
        rightSideGroup.railNoteMesh.material.uniforms.uTime.value = elapsedTime;
        const index = Math.floor(elapsedTime * TABLE_DENSITY_PER_SECOND);
        const previousLanes =
          mainGroup.laneNoteTable[Math.max(index - REWIND_FACTOR, 0)];
        if (!previousLanes) {
          // we're done
          // return without requesting another frame
          return;
        }
        for (var i = 0; i < previousLanes.length; i++) {
          if (previousLanes[i] === undefined) {
            continue;
          }
          // we assess a penalty if the previous lane is in the past
          // and it has not been hit
          if (
            elapsedTime >
              mainGroup.laneNoteInfo[previousLanes[i]].timing +
                JUDGEMENT_CONSTANTS.CONSIDERATION_WINDOW &&
            !mainGroup.laneNoteInfo[previousLanes[i]].hasHit
          ) {
            comboCount = 0;
            scoreSpan.text("Miss!");
            comboSpan.text(comboCount);
            break;
          }
        }
      }

      tryResizeRendererToDisplay();

      stats.begin();
      renderer.render(scene, camera);
      stats.end();

      requestAnimationFrame(renderLoop);
    };

    requestAnimationFrame(renderLoop);
  };
  const introScreen = $("#intro-screen");
  const friendScreen = $("#friend-screen");
  const waitForGameToStartScreen = $("#wait-screen");
  const ownerWaitScreen = $("#owner-wait-screen");
  const startedScreen = $("#started-screen");
  const practiceScreen = $("#practice-screen");
  const instructionScreen = $("#instruction-screen");
  const scoreGrid = $("#score-grid");
  const introSpinner = $("#loading-spinner");
  // do not await until needed
  const audioDataPromise = getAudioData();
  // routing
  const routing = (() => {
    const hash = window.location.hash;
    return { hash };
  })();
  const hashChange = async () => {
    routing.hash = window.location.hash;
    if (routing.hash.substring(0, 4) === "#/r/") {
      // we have been invited to a game
      const title = routing.hash.substring(4);
      const nameInput = $("#spooky-name-friend");
      $("#start-game-friend").on("click", async () => {
        const name = nameInput.val();
        if (name.length < 3 || name.length > 16) {
          Swal.fire({
            title: "Yikes!",
            text: "Names must be between 3 and 16 characters",
            confirmButtonText: "Got it",
          });
        } else {
          friendScreen.addClass("hidden");
          introSpinner.removeClass("hidden");
          claimPlayerPromise = claimPlayerLoop({ title, name });
          const claimPlayerRes = await claimPlayerPromise;
          if (claimPlayerRes === false) {
            introSpinner.addClass("hidden");
            startedScreen.removeClass("hidden");
          } else {
            introSpinner.addClass("hidden");
            waitForGameToStartScreen.removeClass("hidden");
            const unsubForJoin = showWhoHasJoined(title, claimPlayerRes);
            let started = false;
            let unsub;
            unsub = listen({
              title,
              listener: async (doc) => {
                const data = doc.data();
                if (data.startsAt && !started) {
                  if (unsub) {
                    unsub();
                  }
                  if (unsubForJoin) {
                    unsubForJoin();
                  }
                  started = true;
                  const timeNow = new Date().getTime();
                  await doTimeout(
                    data.startsAt > timeNow ? data.startsAt - timeNow : 0
                  );
                  waitForGameToStartScreen.addClass("hidden");
                  scoreGrid.removeClass("hidden");
                  await doGame({
                    title,
                    audioDataPromise,
                    practice: false,
                    player: claimPlayerRes,
                    name,
                  });
                  await togglePlayBack({
                    audioDataPromise,
                    title,
                    player: claimPlayerRes,
                    name,
                  })();
                }
              },
            });
          }
        }
      });
      introSpinner.addClass("hidden");
      friendScreen.removeClass("hidden");
      ////
    } else if (routing.hash.substring(0, 3) === "#/p") {
      // we are starting from scratch
      $("#start-game-practice").on("click", async () => {
        await handleFullScreen();
        const player = 2;
        await doGame({ audioDataPromise, practice: true, player });
        practiceScreen.addClass("hidden");
        scoreGrid.removeClass("hidden");
        await togglePlayBack({ audioDataPromise, player })();
      });
      introSpinner.addClass("hidden");
      practiceScreen.removeClass("hidden");
    } else {
      // we are starting from scratch
      gamePromise = signInPromise.then(createGame);
      const nameInput = $("#spooky-name");
      $("#new-game").on("click", () => {
        const name = nameInput.val();
        if (name.length < 3 || name.length > 16) {
          Swal.fire({
            title: "Yikes!",
            text: "Names must be between 3 and 16 characters",
            confirmButtonText: "Got it",
          });
        } else {
          claimPlayerPromise = gamePromise.then(({ title }) =>
            claimPlayerLoop({ title, name })
          );
          introScreen.addClass("hidden");
          instructionScreen.removeClass("hidden");
          let unsub;
          Promise.all([gamePromise, claimPlayerPromise]).then(
            ([{ title }, player]) => {
              unsub = showWhoHasJoined(title, player);
            }
          );
          gamePromise.then(({ title }) => {
            $("#share-link").val(
              import.meta.env.PROD
                ? `https://joyride.fm/#/r/${title}`
                : `http://localhost:5173/#/r/${title}`
            );
            $("#share-button").removeClass("invisible");
            $("#share-button").addClass("visible");
          });
          $("#start-game").on("click", async () => {
            instructionScreen.addClass("hidden");
            if (unsub) {
              unsub();
            }
            await handleFullScreen();
            ownerWaitScreen.removeClass("hidden");
            const claimPlayerRes = await claimPlayerPromise;
            const starting = new Date();
            const { title } = await gamePromise;
            await setStart({
              title,
              startsAt: starting.getTime() + START_DELAY,
            });
            await doTimeout(START_DELAY);
            ownerWaitScreen.addClass("hidden");
            scoreGrid.removeClass("hidden");
            await doGame({
              audioDataPromise,
              practice: false,
              player: claimPlayerRes,
              title,
              name,
            });
            await togglePlayBack({
              audioDataPromise,
              title,
              player: claimPlayerRes,
              name,
            })();
          });
        }
      });

      introSpinner.addClass("hidden");
      introScreen.removeClass("hidden");
    }
  };
  new ClipboardJS(".clippy");
  $(".clippy").on("click", () => {
    Swal.fire({
      title: "Copied!",
      text: "The link is copied to your clipboard. Send it to up to 7 friends!",
      timer: 2000,
      confirmButtonText: "Got it 👍",
    });
  });
  // for now don't track hash changes as we're not doing any in-app navigation
  // window.addEventListener("hashchange", hashChange);
  hashChange();
};

main();
