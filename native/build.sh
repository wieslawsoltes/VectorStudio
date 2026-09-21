#!/usr/bin/env sh
set -eu
c++ -std=c++17 -O2 -Wall -Wextra native/cdr-pages.cpp $(pkg-config --cflags --libs libcdr-0.1 librevenge-0.0 librevenge-stream-0.0 librevenge-generators-0.0) -o native/vellum-cdr-pages
