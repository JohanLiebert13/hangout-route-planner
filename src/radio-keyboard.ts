import { Platform } from 'react-native';
// React Native Web handles Enter on radios, but reserves Space for button roles.
export function radioKeyboard(onSelect: () => void) {
  return Platform.OS === 'web' ? { onKeyDown(event: { key: string; repeat: boolean; currentTarget: HTMLElement; preventDefault(): void }) {
    if (event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); if (!event.repeat) onSelect(); return; }
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const group=event.currentTarget.closest('[role="radiogroup"]'); if (!group) return;
    const choices=Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter(el=>el.getAttribute('aria-disabled')!=='true');
    const index=choices.indexOf(event.currentTarget); if (index<0||!choices.length) return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+choices.length)%choices.length;
    choices[next].focus(); choices[next].click();
  } } : {};
}
