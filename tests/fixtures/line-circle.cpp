#include <windows.h>
#include <iostream>
#include <cmath>
#include <GL/gl.h>
#include <GL/glut.h>
using namespace std;
int X1, Y1, X2, Y2;
int centerX, centerY, radius;
void DDA() {
    glClear(GL_COLOR_BUFFER_BIT); glColor3f(0, 0, 0); glPointSize(2);
    glBegin(GL_POINTS);
    float m = (float)(Y2 - Y1) / (X2 - X1);
    float x = X1, y = Y1;
    glVertex2d(round(x), round(y));
    if (m <= 1) {
        while (x < X2) { x += 1; y += m; glVertex2d(round(x), round(y)); }
    } else {
        while (y < Y2) { x += 1 / m; y += 1; glVertex2d(round(x), round(y)); }
    }
    glEnd(); glFlush();
}
void Bresenham() {
    glClear(GL_COLOR_BUFFER_BIT); glColor3f(0, 0, 0); glPointSize(2);
    glBegin(GL_POINTS);
    int x = X1, y = Y1, dx = abs(X2 - X1), dy = abs(Y2 - Y1);
    int sx = X1 < X2 ? 1 : -1, sy = Y1 < Y2 ? 1 : -1, p = dx - dy;
    while (true) {
        glVertex2i(x, y);
        if (x == X2 && y == Y2) break;
        int p2 = 2 * p;
        if (p2 > -dy) { p -= dy; x += sx; }
        if (p2 < dx) { p += dx; y += sy; }
    }
    glEnd(); glFlush();
}
void MidpointCircle() {
    glClear(GL_COLOR_BUFFER_BIT); glColor3f(0, 0, 0); glPointSize(2);
    glBegin(GL_POINTS);
    int x = 0, y = radius, p = 1 - radius;
    while (x <= y) {
        glVertex2i(centerX + x, centerY + y); glVertex2i(centerX - x, centerY + y);
        glVertex2i(centerX + x, centerY - y); glVertex2i(centerX - x, centerY - y);
        glVertex2i(centerX + y, centerY + x); glVertex2i(centerX - y, centerY + x);
        glVertex2i(centerX + y, centerY - x); glVertex2i(centerX - y, centerY - x);
        if (p < 0) p += 2 * x + 3;
        else { p += 2 * (x - y) + 5; y--; }
        x++;
    }
    glEnd(); glFlush();
}
void myInit() {
    glClearColor(1, 1, 1, 0);
    glMatrixMode(GL_PROJECTION); glLoadIdentity(); gluOrtho2D(0, 640, 0, 480);
}
int main(int argc, char** argv) {
    int choice;
    cout << "Enter your choice:\n";
    cout << "1. Midpoint Line Drawing / Bresenham's Line Drawing Algorithm\n";
    cout << "2. Midpoint Circle Algorithm\n";
    cout << "3. Exit\n";
    cin >> choice;
    if (choice == 3) return 0;
    else if (choice == 1) {
        cout << "Enter an Initial Point (X1 Y1): "; cin >> X1 >> Y1;
        cout << "Enter the Final Point (X2 Y2): "; cin >> X2 >> Y2;
    } else if (choice == 2) {
        cout << "X-coordinate: "; cin >> centerX;
        cout << "Y-coordinate: "; cin >> centerY;
        cout << "Enter the radius: "; cin >> radius;
        if (radius < 0) { cout << "Radius must not be negative.\n"; return 0; }
    } else { cout << "Invalid choice!\n"; return 0; }
    glutInit(&argc, argv); glutInitDisplayMode(GLUT_SINGLE | GLUT_RGB);
    glutInitWindowSize(640, 480); glutInitWindowPosition(100, 150);
    glutCreateWindow("Line and Circle Drawing");
    myInit();
    if (choice == 1) glutDisplayFunc(Bresenham);
    else glutDisplayFunc(MidpointCircle);
    glutMainLoop();
    return 0;
}
