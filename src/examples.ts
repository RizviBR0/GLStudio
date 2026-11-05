import type { SourceFile } from '../shared/contracts';

export interface Example { id: string; name: string; description: string; tag: string; files: SourceFile[] }

const triangle = `// Welcome to GL Studio. Your canvas starts with C++.
// Run with Ctrl+Enter. Edit the vertices and try again.
#include <GL/glut.h>

void display() {
    glClear(GL_COLOR_BUFFER_BIT);

    glBegin(GL_TRIANGLES);
        glColor3f(0.36f, 0.91f, 0.72f);
        glVertex2f(0.0f, 0.72f);

        glColor3f(0.29f, 0.55f, 0.98f);
        glVertex2f(-0.72f, -0.62f);

        glColor3f(0.78f, 0.46f, 0.98f);
        glVertex2f(0.72f, -0.62f);
    glEnd();

    glutSwapBuffers();
}

void reshape(int width, int height) {
    glViewport(0, 0, width, height);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    float aspect = (float)width / (height ? height : 1);
    if (aspect > 1.0f)
        glOrtho(-aspect, aspect, -1, 1, -1, 1);
    else
        glOrtho(-1, 1, -1 / aspect, 1 / aspect, -1, 1);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
}

int main(int argc, char** argv) {
    glutInit(&argc, argv);
    glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGB);
    glutInitWindowSize(640, 480);
    glutCreateWindow("My first triangle");
    glClearColor(0.055f, 0.067f, 0.09f, 1.0f);
    glutDisplayFunc(display);
    glutReshapeFunc(reshape);
    glutMainLoop();
    return 0;
}
`;

const dda = `// Digital Differential Analyzer — one point at a time.
#include <GL/glut.h>
#include <cmath>

void lineDDA(float x1, float y1, float x2, float y2) {
    float dx = x2 - x1, dy = y2 - y1;
    int steps = (int)std::fmax(std::fabs(dx), std::fabs(dy));
    if (steps == 0) return;
    float x = x1, y = y1;
    glBegin(GL_POINTS);
    for (int i = 0; i <= steps; i++) {
        glVertex2f(std::round(x), std::round(y));
        x += dx / steps;
        y += dy / steps;
    }
    glEnd();
}

void display() {
    glClear(GL_COLOR_BUFFER_BIT);
    glPointSize(3.0f);
    glColor3f(0.36f, 0.91f, 0.72f);
    lineDDA(80, 80, 400, 360);
    glColor3f(0.45f, 0.62f, 1.0f);
    lineDDA(80, 360, 400, 80);
    glutSwapBuffers();
}

void reshape(int w, int h) {
    glViewport(0, 0, w, h);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(0, 480, 0, 440, -1, 1);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
}

int main(int argc, char** argv) {
    glutInit(&argc, argv);
    glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGB);
    glutInitWindowSize(640, 480);
    glutCreateWindow("DDA line drawing");
    glClearColor(0.055f, 0.067f, 0.09f, 1.0f);
    glutDisplayFunc(display);
    glutReshapeFunc(reshape);
    glutMainLoop();
    return 0;
}
`;

const animation = `// Timer animation. Click the viewport, then press Space.
#include <GL/glut.h>

float angle = 0.0f;
bool spinning = true;

void display() {
    glClear(GL_COLOR_BUFFER_BIT);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glRotatef(angle, 0.0f, 0.0f, 1.0f);
    glBegin(GL_TRIANGLES);
        glColor3f(0.36f, 0.91f, 0.72f);
        glVertex2f(0.0f, 0.65f);
        glColor3f(0.29f, 0.55f, 0.98f);
        glVertex2f(-0.56f, -0.33f);
        glColor3f(0.78f, 0.46f, 0.98f);
        glVertex2f(0.56f, -0.33f);
    glEnd();
    glutSwapBuffers();
}

void tick(int) {
    if (spinning) angle += 1.0f;
    glutPostRedisplay();
    glutTimerFunc(16, tick, 0);
}

void keyboard(unsigned char key, int, int) {
    if (key == ' ') spinning = !spinning;
}

void reshape(int w, int h) {
    glViewport(0, 0, w, h);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    float a = (float)w / (h ? h : 1);
    if (a >= 1) glOrtho(-a, a, -1, 1, -1, 1);
    else glOrtho(-1, 1, -1/a, 1/a, -1, 1);
    glMatrixMode(GL_MODELVIEW);
}

int main(int argc, char** argv) {
    glutInit(&argc, argv);
    glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGB);
    glutCreateWindow("A little motion");
    glClearColor(0.055f, 0.067f, 0.09f, 1.0f);
    glutDisplayFunc(display);
    glutReshapeFunc(reshape);
    glutKeyboardFunc(keyboard);
    glutTimerFunc(16, tick, 0);
    glutMainLoop();
    return 0;
}
`;

export const examples: Example[] = [
    { id: 'triangle', name: 'Hello, triangle', description: 'Vertices, colors, and your first frame.', tag: 'GET STARTED', files: [{ path: 'main.cpp', content: triangle }] },
    { id: 'dda', name: 'DDA line drawing', description: 'Explore a classic raster algorithm.', tag: 'ALGORITHMS', files: [{ path: 'main.cpp', content: dda }] },
    { id: 'animation', name: 'A little motion', description: 'Timers, transforms, and keyboard input.', tag: 'ANIMATION', files: [{ path: 'main.cpp', content: animation }] },
];
