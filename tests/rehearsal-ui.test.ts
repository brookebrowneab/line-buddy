// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {LineCheck} from '../src/check';
import {resetAll,setSettings} from '../src/lib/progress';
import {localBrowser} from './support/local-browser';
afterEach(()=>{cleanup();resetAll();vi.unstubAllGlobals();});
it('shows loading, supports cancellation and retries after microphone denial with typing still available',async()=>{
 const browser=localBrowser();browser.hold();setSettings({microphone:true});
 let denied=true;const stop=vi.fn();
 const getUserMedia=vi.fn(async()=>{if(denied)throw new DOMException('Microphone permission denied','NotAllowedError');return{getTracks:()=>[{stop}]};});
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});
 class Recorder{static isTypeSupported(){return true;}state='inactive';mimeType='audio/webm';onstop?:()=>void;start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}}
 vi.stubGlobal('MediaRecorder',Recorder);
 const onDone=vi.fn();render(React.createElement(LineCheck,{lines:['O Romeo'],onDone}));
 fireEvent.click(screen.getByRole('button',{name:'Listen to me'}));
 await waitFor(()=>expect(browser.workers).toHaveLength(1));
 act(()=>browser.workers[0].progress());
 expect(screen.getByRole('status').textContent).toContain('Downloading speech model');
 expect(screen.getByRole('progressbar')).toBeTruthy();expect(getUserMedia).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(browser.workers[0].terminated).toBe(true);
 expect(screen.getByLabelText('Type the first letter of each word')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Listen to me'}));
 await waitFor(()=>expect(browser.workers).toHaveLength(2));
 await act(async()=>browser.workers[1].reply());
 await waitFor(()=>expect(screen.getByRole('status').textContent).toMatch(/permission denied/i));
 expect(screen.getByLabelText('Type the first letter of each word')).toBeTruthy();
 denied=false;fireEvent.click(screen.getByRole('button',{name:'Listen to me'}));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Listening…'));
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(stop).toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Type the first letter of each word'),{target:{value:'o'}});
 fireEvent.change(screen.getByLabelText('Type the first letter of each word'),{target:{value:'r'}});
 expect(onDone).toHaveBeenCalledWith('good');expect(browser.network).not.toHaveBeenCalled();
});
it('keeps the microphone off by default and permits typing without downloading a model',()=>{
 const browser=localBrowser();const done=vi.fn();render(React.createElement(LineCheck,{lines:['Romeo'],onDone:done}));
 expect((screen.getByRole('button',{name:'Listen to me'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Type the first letter of each word'),{target:{value:'r'}});
 expect(done).toHaveBeenCalledWith('good');expect(browser.workers).toHaveLength(0);
});
