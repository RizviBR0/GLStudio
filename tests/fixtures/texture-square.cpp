#include <GL/glut.h>

void display() {
  glClear(GL_COLOR_BUFFER_BIT);
  glBegin(GL_QUADS);
  glTexCoord2f(0, 0); glVertex2f(-0.5f, -0.5f);
  glTexCoord2f(1, 0); glVertex2f(0.5f, -0.5f);
  glTexCoord2f(1, 1); glVertex2f(0.5f, 0.5f);
  glTexCoord2f(0, 1); glVertex2f(-0.5f, 0.5f);
  glEnd();
  glFlush();
}

int main(int argc, char** argv) {
  glutInit(&argc, argv);
  glutInitDisplayMode(GLUT_SINGLE | GLUT_RGB);
  glutInitWindowSize(600, 600);
  glutCreateWindow("Checkerboard");
  glClearColor(1, 1, 1, 1);

  unsigned char pixels[8][8][3];
  for (int y = 0; y < 8; ++y) {
    for (int x = 0; x < 8; ++x) {
      pixels[y][x][0] = 255;
      pixels[y][x][1] = (x + y) % 2 ? 255 : 0;
      pixels[y][x][2] = 0;
    }
  }
  GLuint texture;
  glGenTextures(1, &texture);
  glBindTexture(GL_TEXTURE_2D, texture);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, 8, 8, 0, GL_RGB, GL_UNSIGNED_BYTE, pixels);
  glEnable(GL_TEXTURE_2D);
  glutDisplayFunc(display);
  glutMainLoop();
}
