#ifndef GLSTUDIO_GLUT_H
#define GLSTUDIO_GLUT_H

#include <GL/gl.h>
#include <GL/glu.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GLUT_RGB 0x0000
#define GLUT_RGBA GLUT_RGB
#define GLUT_INDEX 0x0001
#define GLUT_SINGLE 0x0000
#define GLUT_DOUBLE 0x0002
#define GLUT_ACCUM 0x0004
#define GLUT_ALPHA 0x0008
#define GLUT_DEPTH 0x0010
#define GLUT_STENCIL 0x0020
#define GLUT_MULTISAMPLE 0x0080
#define GLUT_STEREO 0x0100
#define GLUT_LUMINANCE 0x0200
#define GLUT_LEFT_BUTTON 0
#define GLUT_MIDDLE_BUTTON 1
#define GLUT_RIGHT_BUTTON 2
#define GLUT_DOWN 0
#define GLUT_UP 1
#define GLUT_KEY_F1 1
#define GLUT_KEY_F2 2
#define GLUT_KEY_F3 3
#define GLUT_KEY_F4 4
#define GLUT_KEY_F5 5
#define GLUT_KEY_F6 6
#define GLUT_KEY_F7 7
#define GLUT_KEY_F8 8
#define GLUT_KEY_F9 9
#define GLUT_KEY_F10 10
#define GLUT_KEY_F11 11
#define GLUT_KEY_F12 12
#define GLUT_KEY_LEFT 100
#define GLUT_KEY_UP 101
#define GLUT_KEY_RIGHT 102
#define GLUT_KEY_DOWN 103
#define GLUT_KEY_PAGE_UP 104
#define GLUT_KEY_PAGE_DOWN 105
#define GLUT_KEY_HOME 106
#define GLUT_KEY_END 107
#define GLUT_KEY_INSERT 108
#define GLUT_ACTIVE_SHIFT 1
#define GLUT_ACTIVE_CTRL 2
#define GLUT_ACTIVE_ALT 4
#define GLUT_WINDOW_X 100
#define GLUT_WINDOW_Y 101
#define GLUT_WINDOW_WIDTH 102
#define GLUT_WINDOW_HEIGHT 103
#define GLUT_WINDOW_BUFFER_SIZE 104
#define GLUT_WINDOW_STENCIL_SIZE 105
#define GLUT_WINDOW_DEPTH_SIZE 106
#define GLUT_WINDOW_DOUBLEBUFFER 115
#define GLUT_WINDOW_RGBA 116
#define GLUT_SCREEN_WIDTH 200
#define GLUT_SCREEN_HEIGHT 201
#define GLUT_INIT_WINDOW_WIDTH 502
#define GLUT_INIT_WINDOW_HEIGHT 503
#define GLUT_INIT_DISPLAY_MODE 504
#define GLUT_ELAPSED_TIME 700

void glutInit(int *argc, char **argv);
void glutInitDisplayMode(unsigned int mode);
void glutInitWindowSize(int width, int height);
void glutInitWindowPosition(int x, int y);
int glutCreateWindow(const char *title);
void glutDestroyWindow(int window);
int glutGetWindow(void);
void glutSetWindow(int window);
void glutSetWindowTitle(const char *title);
void glutDisplayFunc(void (*callback)(void));
void glutReshapeFunc(void (*callback)(int, int));
void glutIdleFunc(void (*callback)(void));
void glutTimerFunc(unsigned int milliseconds, void (*callback)(int), int value);
void glutKeyboardFunc(void (*callback)(unsigned char, int, int));
void glutKeyboardUpFunc(void (*callback)(unsigned char, int, int));
void glutSpecialFunc(void (*callback)(int, int, int));
void glutSpecialUpFunc(void (*callback)(int, int, int));
void glutMouseFunc(void (*callback)(int, int, int, int));
void glutMotionFunc(void (*callback)(int, int));
void glutPassiveMotionFunc(void (*callback)(int, int));
void glutMainLoop(void);
void glutLeaveMainLoop(void);
void glutPostRedisplay(void);
void glutSwapBuffers(void);
int glutGet(unsigned int query);
int glutGetModifiers(void);
void glutReshapeWindow(int width, int height);
void glutSolidCube(GLdouble size);
void glutWireCube(GLdouble size);

#define GLSTUDIO_UNSUPPORTED __attribute__((unavailable("This GLUT feature is outside GL Studio's single-window browser profile. See Compatibility in the IDE.")))
int glutCreateSubWindow(int, int, int, int, int) GLSTUDIO_UNSUPPORTED;
int glutCreateMenu(void (*)(int)) GLSTUDIO_UNSUPPORTED;
void glutAttachMenu(int) GLSTUDIO_UNSUPPORTED;
void glutAddMenuEntry(const char *, int) GLSTUDIO_UNSUPPORTED;
void glutFullScreen(void) GLSTUDIO_UNSUPPORTED;
void glutPositionWindow(int, int) GLSTUDIO_UNSUPPORTED;
void glutMainLoopEvent(void) GLSTUDIO_UNSUPPORTED;
void glutBitmapCharacter(void *, int) GLSTUDIO_UNSUPPORTED;
void glutStrokeCharacter(void *, int) GLSTUDIO_UNSUPPORTED;
void glutSolidSphere(GLdouble, GLint, GLint) GLSTUDIO_UNSUPPORTED;
void glutWireSphere(GLdouble, GLint, GLint) GLSTUDIO_UNSUPPORTED;
void glutSolidTeapot(GLdouble) GLSTUDIO_UNSUPPORTED;
void glutWireTeapot(GLdouble) GLSTUDIO_UNSUPPORTED;

#ifdef __cplusplus
}
#endif
#endif
