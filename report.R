#!/usr/bin/env Rscript
args = commandArgs(trailingOnly=TRUE)
phases = read.csv('results/phases.csv')

backburner = phases[phases$set == 'backburner' & phases$phase == 'paint' & phases$type == 'cumulative',]$ms
control = phases[phases$set == 'control' & phases$phase == 'paint' & phases$type == 'cumulative',]$ms

result = wilcox.test(backburner, control, conf.int=TRUE)

# by default string factors are ordered alphabetically
phases$phase = factor(phases$phase,
    levels=c('load','boot','transition','render','lazy-render','after-render','paint'),
    labels=c('Load','Boot','Transition','Render','Lazy Render','After Render','Paint'))
phases$set = factor(phases$set,
  levels=c('control', 'backburner'),
  labels=c('Control', 'New Backburner'))
library('ggplot2')

png(file='results/plot.png', width=1024, height=768)
ggplot(aes(y = ms, x = phase, color = set), data = phases) +
  facet_grid(type ~ ., scales='free_y') +
  geom_boxplot(outlier.size=0.5, outlier.shape=4) +
  labs(title = "LinkedIn Feed with new Backburner", color = "Set",
    x = paste0("estimated shift: ", result$estimate, " confidence interval (0.95): ", result$conf.int[1], " ", result$conf.int[2], " p.value: ", result$p.value))
dev.off()
