#include <cstdio>
int main() {
  std::puts("The execution worker will now enter an infinite loop.");
  volatile unsigned long long counter = 0;
  while (true) ++counter;
}
