cmake_minimum_required(VERSION 3.20)
project(circuitjs1 C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
# std::to_chars(double) needs macOS 13.3
set(CMAKE_OSX_DEPLOYMENT_TARGET 13.3 CACHE STRING "")

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE RelWithDebInfo)
endif()

if(MSVC)
    add_compile_options(/W3 /utf-8 /fp:precise)
    add_compile_definitions(_USE_MATH_DEFINES NOMINMAX)
else()
    add_compile_options(-Wall -Wextra -Wno-unused-parameter)
    # JS never fuses a*b+c; doing so here makes results differ from the TS version in the last bit
    add_compile_options(-ffp-contract=off)
endif()

# simulator core: no UI dependencies
file(GLOB CORE_SOURCES CONFIGURE_DEPENDS src/core/*.cpp src/core/matrix/*.cpp src/elements/*.cpp)
add_library(circuitcore STATIC ${CORE_SOURCES} src/third_party/v8/ieee754.cc)

# V8's math functions, built the way Node/Chrome build them.  On arm64, clang's default
# is to fuse a*b+c inside these functions, and the results differ in the last bit if we
# don't do the same.
option(JSMATH_FP_CONTRACT "allow FMA contraction in V8's math functions (matches Node on arm64)" ON)
if(JSMATH_FP_CONTRACT AND NOT MSVC)
    set_source_files_properties(src/third_party/v8/ieee754.cc PROPERTIES COMPILE_OPTIONS "-ffp-contract=on")
endif()
target_include_directories(circuitcore PUBLIC src)

# headless trace tool, compared against tools/simtrace.ts by tools/compare.py
add_executable(simtrace tools/simtrace.cpp)
target_link_libraries(simtrace circuitcore)
add_executable(exprtest tools/exprtest.cpp)
target_link_libraries(exprtest circuitcore)

# the app (needs Qt 6; set CMAKE_PREFIX_PATH or Qt6_DIR, e.g. ~/Qt/6.8.3/macos)
if(NOT CMAKE_PREFIX_PATH AND EXISTS "$ENV{HOME}/Qt/6.8.3/macos")
    list(APPEND CMAKE_PREFIX_PATH "$ENV{HOME}/Qt/6.8.3/macos")
endif()
if(NOT CMAKE_PREFIX_PATH AND MSVC AND EXISTS "$ENV{USERPROFILE}/Qt/6.8.3/msvc2022_64")
    file(TO_CMAKE_PATH "$ENV{USERPROFILE}/Qt/6.8.3/msvc2022_64" QT_WIN_DIR)
    list(APPEND CMAKE_PREFIX_PATH "${QT_WIN_DIR}")
endif()
find_package(Qt6 COMPONENTS Widgets Svg PrintSupport)
if(Qt6_FOUND)
    set(CMAKE_AUTOMOC ON)
    file(GLOB APP_SOURCES CONFIGURE_DEPENDS src/app/*.cpp)
    add_executable(CircuitJS1 MACOSX_BUNDLE WIN32 ${APP_SOURCES})
    # audio playback and audio file decoding (third_party/miniaudio)
    add_library(miniaudio STATIC src/third_party/miniaudio/miniaudio.c)
    target_include_directories(miniaudio PUBLIC src/third_party/miniaudio)
    if(NOT MSVC)
        target_compile_options(miniaudio PRIVATE -w)
    endif()
    if(APPLE)
        target_link_libraries(miniaudio PUBLIC "-framework CoreFoundation" "-framework CoreAudio" "-framework AudioToolbox")
    elseif(UNIX)
        target_link_libraries(miniaudio PUBLIC dl pthread m)
    endif()
    target_link_libraries(CircuitJS1 circuitcore miniaudio Qt6::Widgets Qt6::Svg Qt6::PrintSupport)
    set_target_properties(CircuitJS1 PROPERTIES
        MACOSX_BUNDLE_GUI_IDENTIFIER com.lushprojects.circuitjs1
        MACOSX_BUNDLE_BUNDLE_NAME CircuitJS1)

    # the example circuits and the Circuits menu list, from the TS version
    set(TS_PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/../ts/public)
    if(APPLE)
        set(RESOURCE_DIR $<TARGET_BUNDLE_CONTENT_DIR:CircuitJS1>/Resources)
    else()
        set(RESOURCE_DIR $<TARGET_FILE_DIR:CircuitJS1>/resources)
    endif()
    add_custom_command(TARGET CircuitJS1 POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory ${RESOURCE_DIR}
        COMMAND ${CMAKE_COMMAND} -E copy_if_different ${TS_PUBLIC}/setuplist.txt ${RESOURCE_DIR}/setuplist.txt
        COMMAND ${CMAKE_COMMAND} -E copy_directory ${TS_PUBLIC}/circuits ${RESOURCE_DIR}/circuits
        COMMAND ${CMAKE_COMMAND} -E make_directory ${RESOURCE_DIR}/font
        COMMAND ${CMAKE_COMMAND} -E copy_if_different ${TS_PUBLIC}/circuitjs/font/fontello.ttf ${TS_PUBLIC}/circuitjs/font/LICENSE.txt ${RESOURCE_DIR}/font/
        # help pages that edit dialogs link to (EditInfo.makeLink)
        COMMAND ${CMAKE_COMMAND} -E make_directory ${RESOURCE_DIR}/help
        COMMAND ${CMAKE_COMMAND} -E copy_if_different ${CMAKE_SOURCE_DIR}/../war/customfunction.html ${CMAKE_SOURCE_DIR}/../war/customlogic.html ${CMAKE_SOURCE_DIR}/../war/customtransformer.html ${CMAKE_SOURCE_DIR}/../war/about.html ${RESOURCE_DIR}/help/
        COMMENT "Copying example circuits")
    if(WIN32)
        # copy the Qt DLLs and plugins next to the exe so it runs outside the build environment
        find_program(WINDEPLOYQT windeployqt HINTS ${Qt6_DIR}/../../../bin)
        if(WINDEPLOYQT)
            add_custom_command(TARGET CircuitJS1 POST_BUILD
                COMMAND ${WINDEPLOYQT} --no-translations --no-system-d3d-compiler --no-opengl-sw $<TARGET_FILE:CircuitJS1>
                COMMENT "Deploying Qt DLLs")
        endif()
    endif()
else()
    message(STATUS "Qt 6 not found; building only the simulator core and tools")
endif()
