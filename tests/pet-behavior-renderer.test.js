const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPet } = require("./pet-helpers");

async function classicPet(api) {
  const pet = loadPet(api);
  pet.run('applyAppState({activeCharacter:{...FALLBACK_CHARACTER,id:"classic-alice",states:{...FALLBACK_CHARACTER.states,sleep:{row:11,frames:1,interval:600}}},settings:{expressionMode:"automatic"}})');
  pet.images.at(-1).events.load();
  await Promise.resolve();
  return pet;
}

test("sleep overrides stale gestures and left/right movement uses the matching run row", async () => {
  const pet = await classicPet();
  pet.run('playTemporary("waving")');
  const stale = [...pet.timeouts.values()];
  pet.run('applyPetBehavior({mode:"walking",direction:1})');
  assert.equal(pet.run("state"), "runningRight");
  pet.run('applyPetBehavior({mode:"walking",direction:-1})');
  assert.equal(pet.run("state"), "runningLeft");
  pet.run('applyPetBehavior({mode:"sleep",direction:-1})');
  for (const callback of stale) callback();
  assert.equal(pet.run("state"), "sleep");
  assert.equal(pet.sleepIndicator.hidden, false);
  pet.run('applyPetBehavior({mode:"idle",direction:-1})');
  assert.equal(pet.run("state"), "idle");
  assert.equal(pet.sleepIndicator.hidden, true);
});

test("a settings snapshot wakes a sleeping renderer even without a separate behavior event", async () => {
  const pet = await classicPet();
  pet.run('applyPetBehavior({mode:"sleep",direction:-1})');
  pet.run('applyAppState({activeCharacter:character,settings,petBehavior:{mode:"idle",direction:-1}})');
  assert.equal(pet.run("state"), "idle");
  assert.equal(pet.sleepIndicator.hidden, true);
});

test("pointer down wakes immediately before the asynchronous drag reply", async () => {
  let activity = 0;
  const pet = await classicPet({ recordPetActivity() { activity += 1; } });
  pet.run('applyPetBehavior({mode:"sleep",direction:-1})');
  pet.run('beginDrag({button:0,clientX:80,clientY:80})');
  assert.equal(activity, 1);
  assert.equal(pet.run("petBehavior.mode"), "idle");
  assert.equal(pet.run("state"), "idle");
  assert.equal(pet.sleepIndicator.hidden, true);
});
