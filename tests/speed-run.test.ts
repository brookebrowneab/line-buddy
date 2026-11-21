// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {SpeedRun} from '../src/runs';
import {getState,importData,resetAll,setSettings} from '../src/lib/progress';
import {speechItems} from '../src/lib/script';
import {localBrowser} from './support/local-browser';
const speeches=speechItems('mercutio','1.4');
const queenIndex=speeches.findIndex(speech=>speech.lines.join(' ').includes('Queen Mab'));
function openQueenMab(){
 render(React.createElement(SpeedRun,{roleId:'mercutio',sceneId:'1.4',exit:'/'}));
 fireEvent.click(screen.getByRole('button',{name:'Go!'}));
 for(let index=0;index<queenIndex;index++)fireEvent.click(screen.getByRole('button',{name:'Skip for now'}));
}
afterEach(()=>{cleanup();resetAll();vi.unstubAllGlobals();vi.useRealTimers();});
it('checks every Queen Mab word and does not finish after only the opening',()=>{
 openQueenMab();
 expect(screen.getAllByLabelText('hidden word')).toHaveLength(106);
 const words=speeches[queenIndex].lines.join(' ').split(/\s+/);
 for(const word of words.slice(0,30))fireEvent.change(screen.getByLabelText('Type the first letter of each word'),{target:{value:word[0]}});
 expect(screen.queryByRole('button',{name:'Next'})).toBeNull();
 for(const word of words.slice(30))fireEvent.change(screen.getByLabelText('Type the first letter of each word'),{target:{value:word[0]}});
 expect(screen.getByRole('button',{name:'Next'})).toBeTruthy();
 expect(screen.getByRole('status').textContent).toBe('Every word right.');
});
it('allows a whole speech past 90 seconds and stops recording at five minutes',async()=>{
 vi.useFakeTimers();localBrowser();setSettings({microphone:true});
 let recorder:Recorder|undefined;
 const stopTrack=vi.fn();
 class Recorder{
  static isTypeSupported(){return true;}
  state='inactive';mimeType='audio/webm';onstop?:()=>void;
  constructor(){recorder=this;}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.onstop?.();}
 }
 vi.stubGlobal('MediaRecorder',Recorder);
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:stopTrack}]})}});
 openQueenMab();
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Listen to me'}));});
 await act(async()=>{await vi.advanceTimersByTimeAsync(90000);});
 expect(recorder?.state).toBe('recording');expect(stopTrack).not.toHaveBeenCalled();
 await act(async()=>{await vi.advanceTimersByTimeAsync(210000);});
 expect(recorder?.state).toBe('inactive');expect(stopTrack).toHaveBeenCalled();
});

it('keeps old excerpt records but starts a fresh best time for complete speeches',()=>{
 const legacyKey='mercutio|1.4|speed';
 importData(JSON.stringify({...getState(),games:{[legacyKey]:{done:1,best:1234}}}));
 render(React.createElement(SpeedRun,{roleId:'mercutio',sceneId:'1.4',exit:'/'}));
 expect(screen.queryByText(/^Best:/)).toBeNull();
 expect(getState().games[legacyKey].best).toBe(1234);
});
