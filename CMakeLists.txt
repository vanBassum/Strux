# The following lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.16)

# Derive version from git tag (v0.1.0 -> 0.1.0), fallback to 0.0.0-dev
execute_process(
    COMMAND git describe --tags --abbrev=0
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    OUTPUT_VARIABLE GIT_TAG
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
    RESULT_VARIABLE GIT_TAG_RESULT
)
if(GIT_TAG_RESULT EQUAL 0 AND GIT_TAG MATCHES "^v(.+)$")
    set(PROJECT_VER "${CMAKE_MATCH_1}")
else()
    set(PROJECT_VER "0.0.0-dev")
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
# "Trim" the build. Include the minimal set of components, main, and anything it depends on.
idf_build_set_property(MINIMAL_BUILD ON)
project(Stux)

fatfs_create_spiflash_image(www www FLASH_IN_PROJECT)
