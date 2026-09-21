"""Resource bounds for native parsers. Not a security sandbox."""
import os,resource,sys
resource.setrlimit(resource.RLIMIT_AS,(2*1024**3,2*1024**3))
resource.setrlimit(resource.RLIMIT_CPU,(55,60))
resource.setrlimit(resource.RLIMIT_FSIZE,(128*1024**2,128*1024**2))
os.execvp(sys.argv[1],sys.argv[1:])
