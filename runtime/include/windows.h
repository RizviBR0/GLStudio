#ifndef GLSTUDIO_BROWSER_WINDOWS_H
#define GLSTUDIO_BROWSER_WINDOWS_H

/* Compatibility for classroom OpenGL sources that include windows.h only to
 * satisfy desktop header ordering. The browser target does not expose Win32
 * system APIs. Programs that actually call them receive compiler/linker errors.
 */

#endif
