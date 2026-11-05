#include <GL/glut.h>
#include <cstdio>

void display() {
  glClearColor(0.04f, 0.05f, 0.08f, 1.0f);
  glClear(GL_COLOR_BUFFER_BIT);
  glBegin(GL_TRIANGLES);
  glColor3f(0.45f, 0.40f, 1.0f); glVertex2f(-0.7f, -0.6f);
  glColor3f(0.2f, 0.9f, 0.7f); glVertex2f(0.7f, -0.6f);
  glColor3f(1.0f, 0.7f, 0.3f); glVertex2f(0.0f, 0.7f);
  glEnd();
  glutSwapBuffers();
}

int main(int argc, char** argv) {
  glutInit(&argc, argv);
  glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGB);
  glutInitWindowSize(640, 480);
  glutCreateWindow("Immediate-mode triangle");
  std::puts("Hello from real C++ / WebAssembly.");
  glutDisplayFunc(display);
  glutMainLoop();
}
