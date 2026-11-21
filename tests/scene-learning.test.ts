// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {SceneContext,CompleteScene,LearningIntroduction} from '../src/scene-context';
import {Lesson} from '../src/lesson';
import App from '../src/App';
import {chooseRole,getState,resetAll} from '../src/lib/progress';
import {buildSteps} from '../src/lib/games';
import {sceneById,speechItems,type Item,type Scene} from '../src/lib/script';

const scene:Scene={id:'test',act:1,scene:1,title:'Outside the party',summary:'Friends are waiting outside a party.',wants:{romeo:'To stay with your friends.'},items:[
 {k:'d',text:'Enter the friends.'},
 {k:'s',id:'a',role:'mercutio',lines:['First complete exchange.','Its second line.']},
 {k:'s',id:'b',role:'benvolio',lines:['An earlier reply.']},
 {k:'d',text:'They move toward the door.'},
 {k:'s',id:'c',role:'mercutio',lines:['The immediate cue, without being cut short.']},
 {k:'s',id:'d',role:'romeo',lines:['My first response.'],plain:'My first meaning.',why:'Your friend has called you.'},
 {k:'s',id:'e',role:'benvolio',lines:['An intervening speech.']},
 {k:'s',id:'f',role:'romeo',lines:['My last response.'],plain:'My last meaning.',why:'You decide to answer.'},
 {k:'s',id:'g',role:'mercutio',lines:['The final words after Romeo leaves.']},
 {k:'d',text:'All exit.'},
]};
const item=(speechId:string):Item=>{const turn=scene.items.find(t=>t.k==='s'&&t.id===speechId);if(!turn||turn.k!=='s')throw new Error('Missing fixture speech');return {id:speechId,speechId,sceneId:scene.id,role:'romeo',part:0,parts:1,lines:turn.lines,plain:turn.plain,why:turn.why,cue:null};};
beforeEach(()=>{
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callback(0);return 1;});
 vi.stubGlobal('cancelAnimationFrame',vi.fn());
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>{cleanup();resetAll();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('scene context for learning games',()=>{
 it('orients the actor and offers two explicit learning modes without recording progress',()=>{
  const choose=vi.fn();render(React.createElement(LearningIntroduction,{scene,roleId:'romeo',onChoose:choose}));
  expect(screen.getByText('Friends are waiting outside a party.')).toBeTruthy();
  expect(screen.getByText('To stay with your friends.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Learn this scene in order/}));expect(choose).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('button',{name:/Focus on my speeches/}));expect(choose).toHaveBeenLastCalledWith(false);
  expect(getState().items).toEqual({});
 });
 it('shows complete preceding turns and stage action, expands backward, and hides future dialogue',()=>{
  render(React.createElement(SceneContext,{context:{scene,roleId:'romeo',inOrder:false},item:item('d'),fromIndex:0,currentId:'question'}));
  expect(window.scrollTo).toHaveBeenCalledWith(0,0);
  expect(screen.getByText('The immediate cue, without being cut short.')).toBeTruthy();
  expect(screen.getByText('They move toward the door.')).toBeTruthy();
  expect(screen.queryByText('First complete exchange.')).toBeNull();
  expect(screen.queryByText('My first response.')).toBeNull();
  expect(screen.queryByText('An intervening speech.')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Show more before this'}));
  expect(screen.getByText('First complete exchange.')).toBeTruthy();expect(screen.getByText('Its second line.')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Show more before this'})).toBeNull();
 });
 it('keeps ordered history, reveals intervening dialogue, and includes the ending on completion',()=>{
  const context={scene,roleId:'romeo',inOrder:true};
  const view=render(React.createElement(SceneContext,{context,item:item('f'),fromIndex:5,currentId:'question'}));
  expect(screen.getByText('Earlier in the scene')).toBeTruthy();
  expect(screen.getByText('My first response.')).toBeTruthy();expect(screen.getByText('An intervening speech.')).toBeTruthy();
  expect(screen.queryByText('My last response.')).toBeNull();expect(screen.queryByText('The final words after Romeo leaves.')).toBeNull();
  view.rerender(React.createElement(CompleteScene,{context}));
  expect(screen.getByText('My last response.')).toBeTruthy();expect(screen.getByText('The final words after Romeo leaves.')).toBeTruthy();expect(screen.getByText('All exit.')).toBeTruthy();
 });
 it('reveals the complete scene after the last answer without replaying earlier questions',()=>{
  const context={scene,roleId:'romeo',inOrder:true};
  const steps=[item('d'),item('f')].map(entry=>({kind:'understand' as const,item:entry,ids:[entry.id],cap:1}));
  render(React.createElement(Lesson,{steps,exit:'/',title:'Understand',learningContext:context}));
  fireEvent.click(screen.getByRole('button',{name:/What does it mean/}));
  fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  expect(screen.getByText('An intervening speech.')).toBeTruthy();
  expect(screen.queryByText('The final words after Romeo leaves.')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/What does it mean/}));
  fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  expect(screen.getByRole('heading',{name:'The whole scene is now revealed'})).toBeTruthy();
  expect(screen.getByText('All exit.')).toBeTruthy();
 });
 it('keeps a single-speech Thought Cues lesson readable without forcing a microphone or typing task',()=>{
  const role='chorus',realScene=sceneById.get('0.0')!;
  const steps=buildSteps(getState(),'why',role,realScene.id);
  expect(steps).toHaveLength(1);
  render(React.createElement(Lesson,{steps,exit:'/',title:'Thought Cues',learningContext:{scene:realScene,roleId:role,inOrder:true}}));
  expect(screen.queryByRole('button',{name:'Listen to me'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Reveal my response'}));
  const response=screen.getByRole('region',{name:'Your response in context'});
  expect(within(response).getByText('Two households, both alike in dignity')).toBeTruthy();
 });
 it('does not expose the current Thought Cues answer in script history before selection',()=>{
  const realScene=sceneById.get('1.4')!,steps=buildSteps(getState(),'why','mercutio',realScene.id);
  render(React.createElement(Lesson,{steps,exit:'/',title:'Thought Cues',learningContext:{scene:realScene,roleId:'mercutio',inOrder:true}}));
  const context=screen.getByRole('region',{name:'Script context'});
  expect(within(context).queryByText(speechItems('mercutio','1.4')[0].lines[0])).toBeNull();
  expect(screen.queryByRole('region',{name:'Your response in context'})).toBeNull();
 });
 it('connects the real Understand mode chooser to a chronological lesson without the shuffled quiz round',()=>{
  chooseRole('mercutio');window.history.replaceState(null,'','#/play/understand/1.4');
  render(React.createElement(App));
  expect(screen.getByRole('heading',{name:'Find your place in the scene'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Learn this scene in order/}));
  expect(screen.getByRole('button',{name:/Scene in order/})).toBeTruthy();
  for(const _speech of speechItems('mercutio','1.4')){
   fireEvent.click(screen.getByRole('button',{name:/What does it mean/}));
   fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  }
  expect(screen.getByRole('heading',{name:'The whole scene is now revealed'})).toBeTruthy();
 });
 it('keeps an incorrect ordered answer from appending an out-of-order retry',()=>{
  const first=item('d'),last=item('f');
  const steps=[{kind:'why' as const,item:first,ids:[first.id],cap:2,options:[first,last]}];
  render(React.createElement(Lesson,{steps,exit:'/',title:'Thought Cues',learningContext:{scene,roleId:'romeo',inOrder:true}}));
  fireEvent.click(screen.getByRole('button',{name:'My last response.'}));
  expect(screen.getByRole('region',{name:'Your response in context'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  expect(screen.getByRole('heading',{name:'The whole scene is now revealed'})).toBeTruthy();
  expect(screen.queryByText(/Back again:/)).toBeNull();
 });

});
