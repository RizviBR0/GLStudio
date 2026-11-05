#include <GL/glut.h>
#include <cstdio>

float angle = 0;
void display() {
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  glMatrixMode(GL_MODELVIEW); glLoadIdentity();
  glRotatef(angle, 1, 1, 0);
  glColor3f(0.4f, 0.8f, 1.0f);
  glutWireCube(1.0);
  glutSwapBuffers();
}
void reshape(int width, int height) {
  glViewport(0, 0, width, height);
  glMatrixMode(GL_PROJECTION); glLoadIdentity();
  float aspect = static_cast<float>(width) / height;
  glOrtho(-aspect, aspect, -1, 1, -5, 5);
  std::printf("reshape %d %d\n", width, height);
}
void timer(int value) { angle += 1; glutPostRedisplay(); glutTimerFunc(16, timer, 0); }
void keyboard(unsigned char key, int x, int y) { std::printf("key %u at %d %d\n", key, x, y); }
void mouse(int button, int state, int x, int y) { std::printf("mouse %d %d at %d %d\n", button, state, x, y); }
int main(int argc, char** argv) {
  glutInit(&argc, argv); glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGB | GLUT_DEPTH);
  glutCreateWindow("Timer and interaction");
  glEnable(GL_DEPTH_TEST); glClearColor(0.04f, 0.05f, 0.08f, 1);
  glutDisplayFunc(display); glutReshapeFunc(reshape);
  glutKeyboardFunc(keyboard); glutMouseFunc(mouse); glutTimerFunc(16, timer, 0);
  glutMainLoop();
}
