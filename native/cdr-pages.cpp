#include <libcdr/libcdr.h>
#include <librevenge/librevenge.h>
#include <librevenge-stream/librevenge-stream.h>
#include <librevenge-generators/librevenge-generators.h>
#include <iostream>
#include <string>
#include <cstdio>
static void quote(const char* text) {
  std::cout << '"';
  for (const unsigned char* p = reinterpret_cast<const unsigned char*>(text); *p; ++p) {
    if (*p == '"' || *p == '\\') std::cout << '\\' << char(*p);
    else if (*p < 32) { char escape[7]; std::snprintf(escape,sizeof(escape),"\\u%04x",*p); std::cout << escape; }
    else std::cout << char(*p);
  }
  std::cout << '"';
}
int main(int argc, char** argv) {
  if (argc == 2 && std::string(argv[1]) == "--version") { std::cout << "Vellum libcdr adapter 2.0.0\n"; return 0; }
  if (argc != 2) { std::cerr << "Usage: vellum-cdr-pages input.cdr\n"; return 2; }
  try {
    librevenge::RVNGFileStream input(argv[1]);
    librevenge::RVNGStringVector pages;
    librevenge::RVNGSVGDrawingGenerator generator(pages, "");
    if (!libcdr::CDRDocument::isSupported(&input)) { std::cerr << "Unsupported CDR document\n"; return 3; }
    if (!libcdr::CDRDocument::parse(&input, &generator) || pages.empty()) { std::cerr << "CDR parsing failed\n"; return 4; }
    std::cout << "{\"pages\":[";
    for (unsigned i=0; i<pages.size(); ++i) { if (i) std::cout << ','; quote(pages[i].cstr()); }
    std::cout << "]}\n";
    return 0;
  } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 5; }
    catch (...) { std::cerr << "CDR converter error\n"; return 5; }
}
