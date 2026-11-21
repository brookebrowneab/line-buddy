// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {CueCatch} from '../src/runs';
import {dayKey,dayNumber,exportData,getState,importData,mastery,record,recordCue,recordStudy,resetAll} from '../src/lib/progress';
import {todaySteps,GAMES} from '../src/lib/games';
import {partIds,speechItems} from '../src/lib/script';
import {CueProgress} from '../src/skill-progress';
import {Lesson} from '../src/lesson';
afterEach(()=>{cleanup();resetAll();vi.useRealTimers();});
it('catching a cue does not raise word memorization or change word-review difficulty',()=>{
 vi.useFakeTimers();
 const ids=partIds(speechItems('mercutio','1.4')[0]);
 const before=todaySteps(getState(),'mercutio');
 render(React.createElement(CueCatch,{roleId:'mercutio',sceneId:'1.4',exit:'/'}));
 const read=screen.queryByRole('button',{name:/Read the cues/});if(read)fireEvent.click(read);
 fireEvent.click(screen.getByRole('button',{name:'That’s my cue!'}));
 fireEvent.click(screen.getByRole('button',{name:'Show my line'}));
 fireEvent.click(screen.getByRole('button',{name:'Continue'}));
 expect(mastery(getState(),ids)).toBe(0);
 expect(getState().cues[speechItems('mercutio','1.4')[0].speechId]).toMatchObject({seen:1,caught:1,miss:0,last:'good',mode:'read'});
 expect(todaySteps(getState(),'mercutio')).toEqual(before);
});
it('orders the scene path from context through recognition, recall and performance',()=>{
 expect(GAMES.map(game=>game.id)).toEqual(['understand','why','cue','scramble','letters','vanish','sayit','partner','speed']);
});

it('records cue misses independently and skips leave both tracks untouched',async()=>{
 vi.useFakeTimers();
 const first=speechItems('mercutio','1.4')[0];
 render(React.createElement(CueCatch,{roleId:'mercutio',sceneId:'1.4',exit:'/'}));
 const read=screen.queryByRole('button',{name:/Read the cues/});if(read)fireEvent.click(read);
 await act(async()=>{await vi.advanceTimersByTimeAsync(8000);});
 fireEvent.click(screen.getByRole('button',{name:'Show my line'}));
 fireEvent.click(screen.getByRole('button',{name:'Continue'}));
 expect(getState().cues[first.speechId]).toMatchObject({seen:1,caught:0,miss:1,last:'miss'});
 const before=exportData();
 fireEvent.click(screen.getByRole('button',{name:'Skip for now'}));
 expect(exportData()).toBe(before);expect(getState().wordItems).toEqual({});
});
it('word checks update only word memory while cue practice and study still count toward the streak',()=>{
 record(['line:0'],'good',5);
 expect(mastery(getState(),['line:0'])).toBe(.2);expect(getState().cues).toEqual({});
 const words={...getState().wordItems};
 recordCue('speech','good','listen');recordStudy();
 expect(getState().wordItems).toEqual(words);
 expect(getState().days[dayKey(dayNumber())]).toBe(3);
});
it('round-trips the new word and cue tracks in current progress files',()=>{
 record(['verified'],'good',5);recordCue('new-cue','ok','read');
 const saved=exportData();resetAll();expect(importData(saved)).toBe(true);
 expect(getState().wordItems.verified.l).toBe(1);
 expect(getState().cues['new-cue']).toMatchObject({seen:1,caught:1,last:'ok'});
 expect('items' in getState()).toBe(false);
});
it('reading the meaning counts as study rather than a word-memory check',()=>{
 const item=speechItems('mercutio','1.4')[0];
 render(React.createElement(Lesson,{steps:[{kind:'understand',item,ids:partIds(item),cap:1}],exit:'/',title:'Understand'}));
 fireEvent.click(screen.getByRole('button',{name:/What does it mean/}));
 expect(getState().wordItems).toEqual({});expect(getState().cues).toEqual({});
 expect(getState().days[dayKey(dayNumber())]).toBe(1);
});
it('shows cue recognition separately and uses the latest cue result without touching word mastery',()=>{
 const speech=speechItems('mercutio','1.4')[0];
 recordCue(speech.speechId,'good','read');
 const view=render(React.createElement(CueProgress,{state:getState(),roleId:'mercutio',sceneId:'1.4'}));
 expect(screen.getByText('1 of 8 cues caught')).toBeTruthy();
 recordCue(speech.speechId,'miss','listen');
 view.rerender(React.createElement(CueProgress,{state:getState(),roleId:'mercutio',sceneId:'1.4'}));
 expect(screen.getByText('0 of 8 cues caught')).toBeTruthy();expect(mastery(getState(),partIds(speech))).toBe(0);
});
it('rejects malformed current progress tracks without changing saved results',()=>{
 const before=exportData();
 expect(importData(JSON.stringify({...getState(),wordItems:null}))).toBe(false);
 expect(importData(JSON.stringify({...getState(),cues:[]}))).toBe(false);
 expect(exportData()).toBe(before);
});
it('starts testers over once, keeps preferences, and preserves new progress across reloads',async()=>{
 const old={v:1,roles:['mercutio'],active:'mercutio',items:{legacy:{l:4}},wordItems:{old:{l:3}},cues:{old:{seen:3,caught:3,last:'good'}},games:{old:{done:3}},days:{'2026-11-01':2},settings:{microphone:true,voice:false,rate:.8}};
 localStorage.removeItem('line-buddy:v2');localStorage.setItem('line-buddy:v1',JSON.stringify(old));
 vi.resetModules();const first=await import('../src/lib/progress');
 expect(first.getState().wordItems).toEqual({});expect(first.getState().cues).toEqual({});
 expect(first.getState().games).toEqual({});expect(first.getState().days).toEqual({});
 expect(first.getState().roles).toEqual(['mercutio']);expect(first.getState().active).toBe('mercutio');
 expect(first.getState().settings).toMatchObject({microphone:true,voice:false,rate:.8});
 expect('items' in first.getState()).toBe(false);
 expect(localStorage.getItem('line-buddy:v1')).toBeNull();
 first.record(['fresh'],'good',5);
 // A still-open old client must not wipe the new track by writing its old key.
 localStorage.setItem('line-buddy:v1',JSON.stringify(old));
 vi.resetModules();const reloaded=await import('../src/lib/progress');
 expect(reloaded.getState().wordItems.fresh.l).toBe(1);
 expect(localStorage.getItem('line-buddy:v1')).toBeNull();
});
it('does not restore discarded test results from an older backup',()=>{
 record(['fresh'],'good',5);const before=exportData();
 expect(importData(JSON.stringify({v:1,items:{old:{l:5}}}))).toBe(false);
 expect(exportData()).toBe(before);
});
